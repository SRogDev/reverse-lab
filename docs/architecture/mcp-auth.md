# MCP authentication design

Status: design only. The Phase 6 MCP server speaks **stdio only** today;
everything in §2–§4 is a forward design for the HTTP/SSE transport, not
implemented code.

## 1. stdio transport — local trust boundary (implemented)

The server (`src/mcp/server.ts`) communicates over stdio with whoever
launched it. There is no authentication on this channel by design:

- **The trust boundary is the machine, not the pipe.** Any process that can
  spawn `npm run mcp:server` can already read the same `FileStore` data the
  tools expose (or the process's environment), so authenticating the stdio
  client would add ceremony without adding security.
- **Suitable for:** same-machine agents (Muse spawning the server as a
  child, an IDE assistant, a local Polygrow worker).
- **Not suitable for:** anything crossing a machine boundary. The moment the
  server listens on a socket, §2 applies.

Rules for the stdio deployment:

1. The server inherits the caller's `REVERSE_LAB_DATA_DIR`; it never picks a
   data directory from a tool argument (no path traversal into other
   tenants' data).
2. Tool outputs never carry secrets — `provenance` fields are passed through
   as stored, so callers must not write secrets into provenance.
3. Errors are returned as MCP `isError` results with a message; they must
   not leak stack traces or file paths (the server logs those to stderr,
   which stays on the host).

## 2. Future HTTP/SSE transport — design (UNVERIFIED, not implemented)

When the MCP server needs to serve remote clients (Polygrow cloud,
Claude/Cursor over a network), the SDK supports HTTP transports
(`StreamableHTTPServerTransport`, `SSEServerTransport` — both present in
@1.32.1, verified in `node_modules`, but **not wired up**). The design:

### 2.1 Authentication: API-key header

- `Authorization: Bearer <key>` or `X-Reverse-Lab-Key: <key>` on every
  request. Keys are issued per integration (one key for Polygrow, one per
  human developer), never per end-user.
- Keys live in the Secure Vault / environment (`REVERSE_LAB_MCP_KEYS`),
  never in the repo or in tool outputs.
- Key rotation: two active keys per integration, rotate by adding the new
  one, switching traffic, then revoking the old one. Revocation must be
  immediate (checked on every request, no caching beyond a short TTL).

### 2.2 Per-project scoping

An API key is scoped to a set of project ids (or `*` for admin tooling).
Every tool call resolves its target project from its arguments
(`projectId`, or via `investigationId` → run → `projectId`) and rejects
the call with an `isError` result when the key is not scoped to that
project. Scoping is enforced in the tool layer, not in each tool handler
individually — one wrapper, applied to all 7 tools.

### 2.3 RLS at the DB layer

Scoping in the tool layer is a convenience check; the real guarantee is
row-level security in Postgres (Supabase):

- Every table gets a `project_id` (evidence/findings/hypotheses/
  experiments reference it transitively through their investigation run).
- The HTTP server connects to Postgres with a per-request role/session
  derived from the API key's scope; RLS policies filter by that scope.
- Defense in depth: even if a tool-layer check is bypassed, the DB returns
  no rows outside the key's scope.

### 2.4 Rate limiting and audit

- Per-key rate limits on `tools/call` (the investigation tools are
  cheap; the limit exists to catch runaway agents, not humans).
- Append-only audit log of tool calls (key id, tool name, target ids,
  timestamp) — evidence for the lab's own investigation of abuse, and a
  requirement for any paid tier.

## 3. What Polygrow needs to integrate (outline — no implementation)

Polygrow is the first planned remote consumer. It needs:

1. **A keyed HTTP endpoint** for the MCP server (per §2), OR a local
   sidecar: Polygrow runs `reverse-lab`'s MCP server as a child process on
   its own worker (stdio trust model, §1) and exposes only the results
   through Polygrow's own API. The sidecar is the cheaper honest path for
   the MVP; the HTTP transport exists for third-party clients.
2. **Per-project keys** mapping Polygrow workspaces → Reverse Lab projects
   (one key per customer workspace, scoped to that workspace's projects).
3. **RLS policies** in the Supabase schema keyed off the workspace id, so a
   compromised Polygrow key can only ever see one workspace's lab data.
4. **The client contract** in `docs/integrations/mcp-polygrow.md` (the
   7-tool flow) — Polygrow's agent calls the same tools any MCP client
   would; no Polygrow-specific server changes are required.

## 4. Explicitly out of scope for Phase 6

- OAuth / user login flows (no human users touch the MCP server directly).
- Fine-grained per-tool permissions (all 7 tools are available to any
  authenticated key; project scoping is the control).
- Multi-tenant billing on the MCP channel (monetization is docs-only
  until Phase 8).
