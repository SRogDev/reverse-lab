# REA Capability Matrix — three-way classification

**Source:** code + official docs actually read in `morluto/rea` @ v6.5.0 (commit `d9d085a15`, 2026-10-16).
**Rule applied:** nothing claimed from README marketing, blog posts, or social copy alone. Website (rea.tools) claims were NOT audited.

Legend: ✅ VERIFIED (seen in code/docs) · 🔧 NEEDS-CONFIGURATION (exists, needs setup/keys/engines) · ❓ UNVERIFIED (claimed somewhere, no evidence found)

## A. Existence & distribution

| Capability | Class | Evidence |
|---|---|---|
| Repo exists, public, MIT, active | ✅ | `git clone` exit 0; API 200; `git log` 3,398 commits, HEAD 2026-10-16 |
| npm package `rea-agents` v6.5.0 with `rea` bin | ✅ | `package.json` bin → `scripts/rea.mjs` |
| Source builds to `dist/` MCP + CLI runtimes | ✅ | `scripts/rea.mjs` refuses to run without `dist/`; build scripts in `package.json` |
| 1,413 test files; real-toolchain CI lanes | ✅ | file count; `.github/workflows/real-*.yml`; `docs/testing.md` admission criteria |
| Reputation metrics (275k stars / 69k forks) | ❓ | API-reported only; implausible for a 6-month-old repo — **do not cite as quality evidence** |

## B. MCP interface

| Capability | Class | Evidence |
|---|---|---|
| MCP server over **stdio** (`rea mcp`) | ✅ | `src/main.ts` → `serveStdio`; `server.json` transport stdio; MCP SDK 2.3.1 |
| 131 tools registered from zod contracts | ✅ | enumerated `toolContract("…")` sites in `src/server/register*.ts` (full list in rea-audit.md §3.1) |
| MCP over SSE / Streamable HTTP (REA as server) | ❓ | **No evidence** — only stdio paths exist; "streamable" hits are REA-as-client to JEB/IDA |
| Machine-readable tool catalog | ✅ | `binary_session` tool is authoritative; `npm run mcp-catalog:generate` → `docs/public/product-catalog.json` (generated, not checked in) |
| `rea mcp doctor` diagnostics | ✅ | `scripts/rea.mjs` `mcp doctor` branch; `src/mcpDoctor.ts` |
| Input schema profiles (`full`/`compact`) | ✅ | `REA_MCP_INPUT_SCHEMA_PROFILE` in config + client-configuration.md |
| MCP prompts (`registerPrompts.ts`) | ✅ | file exists; prompt contracts in `src/contracts/promptContracts.ts` |

## C. CLI interface

| Capability | Class | Evidence |
|---|---|---|
| 155 one-shot CLI commands, `--json` output | ✅ | `src/cliCommandNames.ts`; `docs/cli.md` |
| Same workflows & evidence contracts as MCP | ✅ | `docs/cli.md` states it; commands share application layer |
| stdout stays pipeable (logs → stderr) | ✅ | `docs/installation.md`; `scripts/rea.mjs` SIGPIPE handling |
| `rea setup` agent registration (Claude Code, Codex, Cursor, Gemini CLI, Grok Build) | ✅ | `docs/installation.md`; `src/cli/setupCommands.ts`, `interactiveSetup.ts` |
| `rea doctor` readiness checks per provider | ✅ | docs reference `rea doctor --provider kuna`; `src/doctorRuntime.ts` |
| `rea update` / `rea uninstall` | ✅ | command names in `cliCommandNames.ts` |

## D. Native binary analysis (deep providers)

| Capability | Class | Evidence |
|---|---|---|
| Provider abstraction; one bound provider per target, no silent failover | ✅ | `src/composition/binary.ts`; `src/contracts/providerSelection.ts` |
| **Ghidra** via `analyzeHeadless` into ephemeral DB, decompile/disassembly/xrefs/strings/symbols | 🔧 | `src/ghidra/`, `bridge/ghidra/*.java`; **requires existing Ghidra install + config** |
| **Hopper** analysis bridge | 🔧 | `src/hopper/`, `bridge/hopper_bridge.py`; **requires Hopper install** (setup can install with approval) |
| **IDA** via upstream ida-pro-mcp (attached 1.4.0 / headless idb supervisor) | 🔧 | `src/ida/`; `docs/ida-provider.md`; **REA never installs/licenses/launches IDA** |
| **Kuna** decompiler (ELF/thin Mach-O, x86-64/AArch64/ARM) | 🔧 | `docs/kuna-provider.md`; **user-supplied `kuna` binary**, `REA_KUNA_COMMAND` |
| **JEB** via JEB's own MCP (`127.0.0.1:8425/mcp`) | 🔧 | `src/jeb/`; `docs/jeb-analysis.md`; **bring-your-own JEB**, REA is the client |
| **Cutter** via Python bridge plugin (v2 handshake, loopback) | 🔧 | `bridge/cutter/rea_bridge.py`; **requires running Cutter + plugin** |
| Rizin (`execute_rizin_command`, debug sessions), GDB console/sessions, objdump | 🔧 | `registerReverseEngineeringTools.ts`, `registerGdbTools.ts`, `registerRizinDebugTools.ts`; **binaries from PATH** (16 MiB capture cap) |
| Function dossiers: pseudocode/assembly/callers/callees/xrefs/strings/CFG with per-facet availability | ✅ | `docs/mcp-contracts.md`; contracts `functionWorkflowToolContracts.ts` |
| Function/artifact/bundle/call-graph comparisons with `unknown` (never false equality) | ✅ | `compare_functions`, `compare_artifacts`, `compare_bundles`, `get_call_graph`, `trace_call_path` contracts |
| Windows Ghidra P0 read-only; Linux/macOS read-only + name/comment edits | ✅ | `docs/ghidra-provider.md` |

## E. Application / source-level analysis (no native engine needed)

| Capability | Class | Evidence |
|---|---|---|
| JS/Electron static analysis (module graph, imports, Electron boundaries) without native engine | ✅ | `analyze_javascript_application`; deps `@babel/parser`, `@electron/asar`; README quickstart |
| JS source recovery / bundle reconstruction (Wakaru) | ✅ | `recover_javascript_sources`; submodule `third_party/wakaru`; CHANGELOG 6.5.0 notes |
| JS runtime observation + static/runtime reconciliation | ✅ | `observe_javascript_runtime`, `reconcile_javascript_runtime`, `correlate_static_and_runtime` |
| .NET assembly metadata/CIL inspection without engine | ✅ | `inspect_managed_artifact`, `inspect_managed_members`; `docs/cli.md` |
| APK: apktool resources, manifest, classes/methods, xref tracing | 🔧 | android/apktool contracts; `third_party/jadx-headless-mcp` submodule; **needs apktool/jadx toolchain present** |
| Firmware extraction (binwalk/unblob submodules) | 🔧 | `extract_firmware`; submodules present; **external tools required** |
| Go/Rust/Swift/ObjC/Dart/Flutter/EVM/WASM/SQLite/pcap/signal inspection | ✅/🔧 | tool contracts exist (✅); some need provider engines or data files (🔧) |
| Browser scenario observation (Playwright) | 🔧 | `playwright-core` dep; **browser binaries required** (`PLAYWRIGHT_BROWSERS_PATH`) |
| Frida instrumentation / ADB device ops | 🔧 | contracts exist; **needs device + frida-server / adb** |

## F. Evidence & integrity model

| Capability | Class | Evidence |
|---|---|---|
| Canonical Evidence record (`evidence_id=ev_<sha256>`, provider, analysis_profile, raw/normalized result, limitations[], relationship_coverage) | ✅ | `src/domain/evidence.ts` zod schema; `docs/mcp-contracts.md` |
| Structured output on every tool result (`structuredContent.normalized_result`) | ✅ | mcp-contracts.md §Tool results |
| Typed error contract (`isError:true` + JSON diagnostic, no structuredContent) | ✅ | mcp-contracts.md; `docs/error-contract.schema.json` |
| Session bundle export/import (atomic, byte-stable, digest-verified) | ✅ | `export_evidence_bundle`, `import_evidence_bundle` contracts |
| Paged views of retained evidence (`inspect_analysis_view`) | ✅ | contract + CLI example in mcp-contracts.md |
| Residual-unknown ledger (`record_unknown`, `list_unknowns`, `verify_unknown_resolution`) | ✅ | contracts; session tools |
| 10 MiB default response budget, `resource_constraint` fallback | ✅ | mcp-contracts.md; `REA_MCP_MAX_RESPONSE_BYTES` |

## G. Integration-relevant properties

| Capability | Class | Evidence |
|---|---|---|
| Zero LLM/API-key requirement in REA itself | ✅ | no LLM deps in `package.json`; no key handling in `src/` (agent supplies reasoning) |
| Runs on Node 24; pure-npm runtime (no Python build of REA core) | ✅ | `.nvmrc` 24.18.0; `package.json` |
| Linux `ps` (procps) prerequisite for several workflows | ✅ | README + `docs/installation.md` |
| Reproducible analysis via analysis-profile digests | ✅ | `analysisProfileSchema` participates in evidence identity |
| Security-sandboxed execution of targets | ❓ | **Explicitly not**: "the target runs with the current user's permissions; this is not a security sandbox" |
| Decompile *accuracy* guarantees | ❓ | Disclaimer: results "may be incomplete or incorrect" — honesty is structural, accuracy is not guaranteed |

## Bottom line

Nothing in the plan's "REA-based RE engine" claim was found to be fictional: the MCP server, the tool catalog breadth, and the evidence model are all **VERIFIED** in code. The honest integration posture is **VERIFIED core + NEEDS-CONFIGURATION engines**: ship the MCP/CLI integration and the evidence pipeline now; native deep analysis lights up only where the operator installs an engine. No pivot to alternatives is required for Phase 1 — but note the two structural constraints for the lab's design: **stdio-only transport** and **no execution sandbox**.
