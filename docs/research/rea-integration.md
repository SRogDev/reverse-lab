# REA Integration Plan — concrete invocation, contracts, evidence flow

**Status:** REA is VERIFIED (see `rea-audit.md`, `rea-capability-matrix.md`). No pivot required. This plan uses only verified mechanisms.
**Scope:** Phase 1 proof-of-concept for a TypeScript/Next.js lab. No implementation here — audit only.

## 1. How REA is actually invoked (verified)

REA ships two interfaces over the same application workflows and evidence contracts (`docs/cli.md`):

### Option A — MCP server over stdio (session-based; required for native deep analysis)

- **Command:** `npx -y rea-agents@latest mcp` (equivalently `rea mcp` after `npm i -g rea-agents`). Verified: `scripts/rea.mjs` routes single-arg `mcp` to `dist/mcp/main.js` → `serveStdio` from `@modelcontextprotocol/server` 2.3.1. `server.json` confirms stdio transport.
- **Wire protocol:** MCP (JSON-RPC 2.0) on stdin/stdout. The lab backend uses an MCP *client* — the natural choice is `@modelcontextprotocol/sdk` (TypeScript), the same SDK family REA itself uses.
- **Session flow for a native target** (verified tool contracts in `src/contracts/sessionToolContracts.ts`):
  1. `binary_session` `{}` → reports target/provider/capability status without starting analysis (discovery).
  2. `open_binary` `{path, provider_id: "ghidra"|"hopper"|"ida"|"kuna"|"auto", format?}` → binds one provider to the target for the session. No silent failover.
  3. Analysis tools, e.g. `binary_overview` `{}`, `analyze_function` `{function: "main"}`, `get_call_graph`, `find_xrefs_to_name`.
  4. `export_evidence_bundle` `{path, overwrite}` → atomically writes byte-stable canonical JSON bundle; `get_evidence_bundle` `{detail:"summary"}` for discovery without large payloads.
  5. `close_binary` `{}` → drains provider requests, closes target.
- **Constraints (verified):** stdio only — the lab backend must spawn and own the child process (no HTTP endpoint to call). Long-lived process: one per investigation session. Default 10 MiB response budget per tool result; raise via `REA_MCP_MAX_RESPONSE_BYTES` env (client buffer must match) or page via `inspect_analysis_view` / export bundles.

### Option B — one-shot CLI with `--json` (stateless; best for Phase 1 PoC)

- **Pattern:** `rea <command> <target> --json > result.json` — each invocation is a separate process; stdout is pure JSON (prompts/logs go to stderr). Verified in `docs/cli.md` and `scripts/rea.mjs`.
- **Zero-engine PoC path (no Ghidra/Hopper/IDA needed):**
  ```bash
  rea analyze-javascript-application /absolute/path/to/app --json > app-evidence.json
  rea inspect-managed-artifact /absolute/path/Assembly.dll --json
  rea inspect-go-binary /absolute/path/to/program --json
  rea inspect-sqlite-database /path/db.sqlite --table users --row-limit 20 --json
  ```
  JS/Electron static analysis and .NET/Go/SQLite inspection run with **no native analysis engine** (verified: README "Static JavaScript analysis needs no native analysis engine"; `docs/cli.md` managed section).
- **Native one-shots** (need engine configured): `rea analyze <path> --provider ghidra --json`, `rea decompile <path> main --json`, `rea function <path> main --json`, `rea execute-rizin-command ./program iI`, `rea inspect-with-objdump …`.
- **Evidence projection:** saved Evidence files can be summarized without rerunning analysis:
  ```bash
  jq -c '{source:{kind:"inline", evidence:.}, view:{kind:"summary"}}' app-evidence.json > view.json
  rea inspect-analysis-view view.json
  ```
  (verified example from `docs/cli.md`; a 334 MB app Evidence summarized to ~10 KB).

### Environment configuration (verified env vars)

Set on the REA process before launch: `REA_ANALYSIS_PROVIDER` (or per-call `provider_id`), engine paths (`REA_GHIDRA_*`, `REA_KUNA_COMMAND`, `REA_IDA_MCP_CONFIG`, `REA_JEB_MCP_URL`, `REA_OBJDUMP_COMMAND`/`REA_GDB_COMMAND`/`REA_RIZIN_COMMAND` or PATH), `REA_MCP_MAX_RESPONSE_BYTES`, `REA_MCP_INPUT_SCHEMA_PROFILE=compact` to cut token cost. First-run readiness: `rea doctor [--provider ghidra]` (verified command name).

## 2. Input/output contracts (verified)

### Tool result envelope (every evidence-producing tool)

From `docs/mcp-contracts.md` §Tool results and `src/domain/evidence.ts`:

```jsonc
// MCP CallToolResult
{
  "content": [ { "type": "text", "text": "<human-readable projection>" } ],
  "structuredContent": {
    "evidence_id": "ev_<sha256 of canonical record>",
    "provider": { "id": "ghidra", "name": "Ghidra", "version": "11.3.2" },
    "analysis_profile": { /* concrete profile object */ "or": null },
    "raw_result": { /* provider-native representation */ "or": null },
    "normalized_result": { /* the operation result — READ THIS */ },
    "limitations": ["string-search covers only Ghidra-defined string Data", "..."],
    "relationship_coverage": { /* call/reference coverage claims */ "or": null }
  },
  "isError": false
}
// On failure: isError:true, content[0].text = canonical {"error": {...}} JSON diagnostic
// (code, target details, partial observations, remediation). No structuredContent.
```

### `open_binary` input (representative; zod-validated)

`{ path, provider_id: "auto"|"<engine>", format?: "raw-binary"|"dos-com"|…, architecture/entry_point (for raw), snapshot? }` — full description in `src/contracts/sessionToolContracts.ts` line 70-74. Reopening the same target+profile reuses the provider DB; provider binding is stable until `close_binary`.

### Comparison/follow-up chaining

`analyze_function` Evidence nests directly into `compare_functions`; `inspect_artifact` Evidence into `compare_artifacts` (verified mcp-contracts.md). Unknowns are first-class: `record_unknown` / `list_unknowns` / `verify_unknown_resolution`.

## 3. How REA outputs feed Reverse Lab evidence records (concrete mapping)

The lab's evidence store can adopt REA's record shape nearly 1:1 (field names verified in `src/domain/evidence.ts`):

| Reverse Lab evidence field | Source in REA output |
|---|---|
| `id` | `structuredContent.evidence_id` (`ev_<sha256>`, content-addressed — dedup for free) |
| `producer` | `structuredContent.provider.{id,name,version}` + `analysis_profile` digest |
| `claim` / `observation` | `structuredContent.normalized_result` (operation-specific schema per tool contract) |
| `raw` | `structuredContent.raw_result` (nullable) |
| `limitations` | `structuredContent.limitations[]` — **store verbatim; these are the honesty guarantees** |
| `coverage` | `relationship_coverage` + per-facet `facet_availability` map (available true/false+reason) |
| `provenance` | tool name + input args + `analysis_profile` (reproducibility: same target+profile ⇒ same digest) |
| `supersedes` / revisions | `export_evidence_bundle` / `import_evidence_bundle` manifests; residual-unknown revision histories |

**Consumption pattern (Phase 1):**
1. Lab backend runs REA (CLI one-shot for PoC; MCP session for multi-step native work).
2. Parse `--json` stdout (CLI) or `structuredContent` (MCP). Validate `evidence_id` format (`ev_` + 64 hex) — cheap integrity check.
3. Persist the record with the mapping above. Surface `limitations[]` in the UI next to every claim — REA's contract explicitly models "unknown, not proven absent", which is exactly the lab's evidence-model requirement.
4. For large results: never inline full Evidence into the agent context — use `detail:"summary"` discovery + `inspect_analysis_view` paging, or `export_evidence_bundle` to object storage and reference by path/`evidence_id`.

## 4. Recommended Phase 1 path (concrete)

**Primary: CLI one-shots over the zero-engine surface.**

1. `npm i -g rea-agents` (or pin `npx -y rea-agents@6.5.0`) in the execution environment. Requires Node 24 + (Linux) procps `ps`.
2. PoC targets: an extracted Electron app dir / ASAR and a .NET DLL — `analyze-javascript-application` and `inspect-managed-artifact` need no engines, so the PoC works on a clean machine and in CI.
3. Ingest `--json` Evidence into the lab's evidence store per §3; build the first UI view as "claims + limitations + evidence_id".
4. Defer native deep analysis (Ghidra/Hopper/IDA) to Phase 2 behind operator-supplied engine configuration — the integration code (MCP stdio client, session lifecycle) is designed now, switched on later via `REA_ANALYSIS_PROVIDER` / `provider_id`.

**Why this path:** it exercises the real REA→evidence pipeline end-to-end with zero external engine installs, zero API keys (REA needs none — verified), and deterministic, digest-identified records. Native engines add operational weight (licenses, installs, GUI-less headless config) that belongs behind the Phase-0 "needs-configuration" gate, not in the PoC.

## 5. Design constraints the lab must respect (all verified)

1. **stdio-only MCP** — the lab backend spawns REA as a child process; there is no HTTP/SSE endpoint. In serverless (Vercel), prefer CLI one-shots per investigation step, or run the MCP server in a long-lived sidecar/sandbox (Vercel Sandbox feasibility is a separate Phase-0 track).
2. **No execution sandbox** — `capture_process_scenario`/Frida/browser tools run real code as the current user. Untrusted targets must run inside the lab's own sandbox (Vercel Sandbox or containers), never on the app server.
3. **Response budget** — 10 MiB default; design the evidence pipeline around summary discovery + paged views + bundle export from day one.
4. **Provider binding is sticky** — one engine per target per session, no auto-failover; surface `binary_session` capability status in the UI before promising native depth.
5. **Legal scope** — REA's DISCLAIMER excludes DRM/license-check/anti-cheat circumvention support; the lab's positioning should not promise those workflows via REA.
6. **Reputation metrics are not evidence** — do not cite REA's star/fork counts anywhere; cite commit activity, test lanes, and the contracts.

## 6. Alternatives — pivot NOT needed, noted for completeness

The task required 2–3 researched alternatives only if REA were unreachable. REA is verified and sufficient, so no pivot. If a future phase needs capabilities outside REA's model (e.g., in-process library use instead of a child-process MCP server, or code-property-graph queries), the natural candidates remain tree-sitter+semgrep (source), rizin (binary, scriptable), and Joern/CodeQL (CPGs) — each would need its own audit before adoption.
