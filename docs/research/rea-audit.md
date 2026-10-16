# REA Audit — morluto/rea (Phase 0, audit only)

**Audited:** 2026-10-16 by technical investigator (subagent)
**Repo:** https://github.com/morluto/rea
**Verdict: REA EXISTS and is a real, actively maintained reverse-engineering tool layer. Usable as the RE capability of Reverse Lab, with per-engine configuration required.**

## 1. Existence check (step 1 of the task)

| Check | Result |
|---|---|
| `git clone https://github.com/morluto/rea.git /tmp/rea` | **Success** (exit 0, ~137 MB on disk, 3,398 commits on `main`) |
| `GET https://api.github.com/repos/morluto/rea` | **200, public, not fork, not archived** |
| Default branch | `main` |
| Latest commit at audit time | `d9d085a15` (2026-10-16) — committed *today* |
| Changelog HEAD | v6.5.0 released 2026-10-13 |
| License (API + LICENSE file) | MIT |
| Primary language | TypeScript |
| Repo size (API) | ~79 MB |

⚠️ **Reputation-metric caveat:** the API reports 275,233 stars / 69,322 forks for a repo created 2026-04-14. That growth rate is not organically plausible for a 6-month-old tooling repo. These numbers look inflated (bot-starring or API anomaly) and **must not be used as quality evidence**. The code itself is what was audited; it is genuinely substantial (3,398 commits, 1,413 test files, 3398-commit history, active CI with real-toolchain lanes).

## 2. What REA actually is

REA ("Reverse Engineer Anything") is published on npm as **`rea-agents` (v6.5.0)**. It is an **orchestration/adapter layer** that exposes reverse-engineering capabilities to AI agents (and humans) through one MCP server plus a one-shot CLI. It is **not** itself a disassembler: the "bring-your-own-engine" model means REA adapts existing engines (Ghidra, Hopper, IDA, JEB, Cutter, Rizin, Frida, GDB, apktool, Wakaru, jadx…) behind a uniform MCP/CLI tool catalog and a rigorous **Evidence model**. Static JavaScript/Electron analysis and .NET metadata parsing are the parts that run with **zero native engines** (pure TypeScript + bundled parsers).

### 2.1 Repository structure (top level, verified by listing)

```
.agents/            agent-workflow instructions installed by `rea setup`
bridge/             python/java bridge shims (cutter/rea_bridge.py, ghidra/*.java,
                    hopper_bridge.py, mitmproxy/, pwndbg/, pwntools/, android/)
docs/               ~70 markdown guides (installation, per-provider semantics,
                    mcp-contracts.md 862 lines, cli.md, testing.md, roadmap.md)
experiments/        experiment fixtures
native/             windows-specific native helpers
scripts/            rea.mjs (the `rea`/`rea-agents` bin), build/catalog generators
server.json         MCP registry metadata (name io.github.morluto/rea, stdio transport)
src/                TypeScript source (see §3)
tests/              1,413 *.test.ts files counted repo-wide
third_party/        git submodules: jadx-headless-mcp, binwalk, unblob,
                    ghidra-nativeaot, wakaru
website/            rea.tools site source
```

### 2.2 Internal architecture (verified in code)

- **Entry points:** `scripts/rea.mjs` (npm bin → `rea`/`rea-agents`) routes to compiled `dist/`:
  - `rea mcp` → `dist/mcp/main.js` (`src/main.ts`) — long-lived **stdio MCP server**
  - `rea mcp doctor` → MCP diagnostics CLI
  - everything else → `dist/cli-runtime/cli.js` — one-shot CLI commands
- **Server layer:** `src/server/createServer.ts` + `src/server/EvidenceMcpServer.ts` (MCP SDK `@modelcontextprotocol/server` **2.3.1**, `serveStdio`). **Transport is stdio only** — no SSE/Streamable-HTTP server of its own (the only "streamable-http" hits are REA *connecting as a client* to upstream JEB/IDA MCP servers). `server.json` confirms stdio.
- **Tool registration:** 30+ `src/server/register*.ts` files register tools against **zod tool contracts** in `src/contracts/` (`toolContract("open_binary")` style). I enumerated **131 distinct MCP tool names** from `toolContract("…")` call sites (see §5).
- **Domain layer:** `src/domain/` — evidence schema, analysis profiles, canonical digests, relationship coverage, typed error taxonomy (`AnalysisError` + `projectAnalysisError` projection).
- **Application layer:** `src/application/` — `BinarySession` lifecycle, investigation record port, provider adapters.
- **Providers:** `src/ghidra/` (Java bridge: `ReaGhidraBridge.java` + extensions, launched via `analyzeHeadless` into an ephemeral DB), `src/hopper/`, `src/ida/` (adapts user's own ida-pro-mcp), `src/jeb/` (adapts JEB's own MCP), `src/cutter/` (local Python bridge + authenticated loopback, v2 handshake), plus rizin/objdump/gdb/frida/adb/apktool/browser/javascript/managed/pcap/firmware/evm/wasm/rust/go/flutter/dotnet/sqlite/signal modules.
- **Setup:** `rea setup` (interactive) detects agents (Claude Code, Codex, Cursor, Gemini CLI, Grok Build…) and writes MCP registrations + a bundled agent-skills workflow (`.agents/`), with backups, dry-run, and explicit approval for Hopper install.

### 2.3 Dependencies (from `package.json`, verified)

Runtime is pure npm, no Python/Go/Rust build of REA itself. Notable runtime deps: `@modelcontextprotocol/server` + `client` 2.3.1, `@babel/parser` 8, `@electron/asar`, `playwright-core` 1.58 (browser observation), `evmole`, `openpgp`, `isomorphic-git`, `zod` 4, `ajv`, `pino`, `ws`, `@lydell/node-pty`, `tokenx`. **No LLM SDK/API-key dependencies** — REA never calls an LLM itself; the agent (Claude Code etc.) supplies the reasoning. This is confirmed by grep: no anthropic/openai keys in `src/` and none in `package.json`. Node requirement: `.nvmrc` pins **Node 24.18.0**.

### 2.4 Installation / execution requirements (verified)

- `npx rea-agents setup` (npm package) or source checkout: `npm ci && npm run build:cached` (the bin refuses to run if `dist/` is missing).
- Linux needs a **procps-compatible `ps`** on PATH for process-ownership checks (Ghidra/JADX/firmware/JS analysis).
- Native deep analysis **requires the engine installed and configured** — REA does not install Ghidra/IDA/JEB/Kuna (except it can optionally install **Hopper** with explicit approval).
- Key env vars (verified in `src/config/parseConfig.ts` + docs): `REA_ANALYSIS_PROVIDER`, `REA_GHIDRA_*` (language/compiler-spec/seed/timeout), `REA_IDA_MCP_CONFIG`, `REA_JEB_MCP_URL`/`REA_JEB_MCP_TIMEOUT_MS`, `REA_KUNA_COMMAND`, `REA_OBJDUMP_COMMAND`/`REA_GDB_COMMAND`/`REA_RIZIN_COMMAND` (else PATH lookup), `REA_ILSPY_CMD_PATH`, `REA_MCP_MAX_RESPONSE_BYTES` (default 10 MiB response budget), `REA_MCP_INPUT_SCHEMA_PROFILE` (`full`/`compact`).

## 3. Tool inventory (verified in code)

### 3.1 MCP tools — 131 names enumerated from `src/server/register*.ts` `toolContract("…")` sites

Session/lifecycle: `open_binary`, `close_binary`, `binary_session`, `export_evidence_bundle`, `import_evidence_bundle`, `inspect_analysis_view`, `get_evidence_bundle`, `list_unknowns`, `record_unknown`, `update_unknown`, `verify_unknown_resolution`

Native function-level: `analyze_function`, `batch_decompile`, `compare_functions`, `get_call_graph`, `trace_call_path`, `build_call_path`, `find_xrefs_to_name`, `binary_overview`, `inspect_binary_layout`, `inspect_address_context`, `inspect_native_api`, `inspect_native_instruction`, `read_bytes`, `search_bytes`, `address_to_file_offset`, `annotate_native_function`, `trace_native_values`, `resolve_native_call_targets`

Binary utilities: `inspect_with_objdump`, `list_objdump_architectures`, `execute_rizin_command`, `debug_with_gdb`, `debug_with_rizin` (`start_gdb_session`, `gdb_session_status`, `gdb_console`, `close_gdb_session`, `start_rizin_debug_session`, `rizin_debug_command`, `rizin_debug_session_status`, `close_rizin_debug_session`), `cutter_command`, `list_cutter_sessions`, `inspect_pe_resources`, `inspect_go_binary`, `inspect_rust_binary`, `analyze_swift_types`, `get_objc_classes`, `get_objc_protocols`, `inspect_dart_aot`, `identify_flutter_build`, `inspect_evm_interface`, `inspect_wasm_artifact`, `compare_wasm_interfaces`

Applications/artifacts: `inspect_artifact`, `extract_artifact`, `compare_artifacts`, `inspect_binary_layout`, `inspect_asset_catalog`, `inspect_keyed_archive`, `decode_interface_builder`, `inspect_native_load_image`, `trace_dylib_resolution`

JavaScript/Electron: `analyze_javascript_application`, `recover_javascript_sources`, `observe_javascript_runtime`, `reconcile_javascript_runtime`, `correlate_static_and_runtime`, `list_javascript_runtime_targets`, `trace_feature`, `verify_reconstruction`, `inspect_electron_fuses`, `inspect_electron_page`, `capture_electron_scenario`, `list_electron_targets`, `trace_web_module_imports`, `analyze_web_bundle`, `export_web_scripts`

Managed (.NET): `inspect_managed_artifact`, `inspect_managed_members` (+ project graph tools)

Android: `inspect_android_package`, `inspect_android_class`, `inspect_android_method`, `search_android_classes`, `trace_android_references`, `decode_android_resources`, `inspect_apktool_client`

Frida: `start_frida_session`, `resume_frida_session`, `close_frida_session`, `frida_session_status`, `load_frida_script`, `unload_frida_script`, `instrument_with_frida`, `list_frida_devices`, `list_frida_processes`

ADB/device: `inspect_adb_client`, `inspect_adb_device`, `inspect_adb_display`, `inspect_adb_package`, `inspect_adb_window`, `list_adb_devices`, `list_adb_features`, `list_adb_packages`, `list_adb_processes`, `list_adb_services`, `list_adb_directory`, `capture_adb_screen`, `collect_adb_bugreport`, `read_adb_logcat`, `read_adb_setting`, `install_adb_package`, `uninstall_adb_package`, `push_adb_file`, `pull_adb_file`, `pull_adb_package`, `start_adb_app`, `stop_adb_app`, `start_adb_activity`, `resolve_adb_packages`

Browser/web runtime: `observe_web_execution`, `observe_web_session`, `inspect_web_page`, `inspect_web_event_listeners`, `inspect_web_network_capture`, `export_web_scripts`, `capture_web_screenshot`, `compare_web_screenshots`, `capture_web_scenario`, `compare_web_captures`, `list_browser_targets`, `get_navigation_context`, `trace_web_source_location`, `trace_native_ui_action`, `discover_webmcp_tools`

Captures/network: `inspect_packet_capture`, `inspect_packet_fields`, `inspect_pcap_capture`, `inspect_pcap_client`, `capture_process_scenario`, `compare_process_captures`, `find_changed_behavior`

Firmware: `extract_firmware`, `inspect_firmware_regions`

Misc: `inspect_sqlite_database`, `inspect_signal_decoders`, `decode_signal_recording`, `inspect_recorded_crash`, `compare_bundles`, `compare_process_captures`, `decompile_jeb_item`, `open_jeb_project`, `list_jeb_units`, `inspect_jeb_client`

(Authoritative list: `binary_session` tool on a running server, or `docs/public/product-catalog.json` generated via `npm run mcp-catalog:generate` — not checked in.)

### 3.2 CLI — 155 unique command names in `src/cliCommandNames.ts`

One-shot equivalents of the MCP workflows: `rea analyze`, `rea decompile`, `rea function`, `rea search`, `rea xrefs`, `rea trace`, `rea inspect-*` (dozens: `inspect-binary-layout`, `inspect-go-binary`, `inspect-sqlite-database`, …), `rea analyze-javascript-application`, `rea execute-rizin-command`, `rea debug-with-gdb`, `rea cutter-command`, `rea setup`, `rea doctor`, `rea uninstall`, `rea update`, `rea capabilities`, `rea providers`, `rea inspect-analysis-view`, `rea inspect-evidence-bundle`, etc. Every CLI command supports `--json`; prompts/logging go to stderr so stdout stays pipeable.

### 3.3 Native "deep providers" (verified `src/composition/binary.ts`)

`HopperProvider`, `GhidraProvider`, `IdaProvider`, `KunaProvider` (+ automatic `auto` selection; one provider stays bound per target, no silent fallback). Requirements per docs:
- **Ghidra** — existing install; REA imports target into an **ephemeral Ghidra DB** via `analyzeHeadless` (Java bridge in `bridge/ghidra/`). Linux/macOS: read-only + atomic function-name/comment edits; **Windows P0 is read-only**. GUI controls/persistent DB mutation unavailable.
- **Hopper** — existing install, or `rea setup` can install it with approval (Hopper is a paid macOS app).
- **IDA** — bring-your-own IDA Pro/Free + upstream `mrexodia/ida-pro-mcp` (attached legacy GUI tools v1.4.0, or headless DB-supervisor build with `idb_open/idb_list/idb_close`); REA never installs/licenses/launches IDA. Config via `REA_IDA_MCP_CONFIG`.
- **Kuna** — user-supplied `kuna` executable (Apache-2.0 decompiler), ELF + thin Mach-O only (x86-64/AArch64/ARM); PE/universal Mach-O rejected. Static only.
- **JEB** — bring-your-own JEB GUI/headless exposing *its own* MCP at `http://127.0.0.1:8425/mcp` (`REA_JEB_MCP_URL`); REA is an MCP *client* here.
- **Cutter** — requires a running Cutter with REA's `bridge/cutter/rea_bridge.py` plugin; authenticated loopback v2 handshake.
- **Rizin/GDB/objdump** — resolved from PATH (overridable via env); Rizin/GDB commands captured with a 16 MiB output cap.

### 3.4 The Evidence model (verified: `src/domain/evidence.ts` + `docs/mcp-contracts.md`, 862 lines)

Every evidence-producing tool returns the canonical record in **both text and `structuredContent`**:
- `evidence_id`: `ev_<sha256>` — canonical-digest identity of the record (verified in code)
- `provider`: `{id, name, version|null}` — who observed it
- `analysis_profile`: concrete profile object or `null` — participates in semantic identity; records omitting it are rejected
- `raw_result`: provider's original representation (null when none)
- `normalized_result`: the operation result (what consumers read)
- `limitations`: string[] — explicit caveats (coverage gaps, unavailable facets)
- `relationship_coverage`: nullable — call/reference coverage claims
- Function dossiers declare per-facet availability (`pseudocode/assembly/comments/callers/callees/references/strings_names/cfg` → available:true/false+reason). Comparisons keep `unknown` dimensions instead of claiming equality on missing data.
- Errors: `isError:true` + complete canonical `{error}` JSON diagnostic (code, target, partial observations, remediation); no `structuredContent` on failure.
- Transport budget: default **10 MiB** per response; oversized results return `resource_constraint` with an evidence reference for `inspect_analysis_view` paging or `export_evidence_bundle` (atomic, streamed, byte-stable JSON) / `import_evidence_bundle`.
- Session: `binary_session` reports target/provider/capability state; `get_evidence_bundle` (`detail: summary|complete`) discovers retained records.

## 4. Supported target types (verified in docs + code)

Binaries: ELF, Mach-O (thin + universal for some providers), PE, DOS MZ/COM, raw binary (arch+entry required); APK/IPA/MSIX/APPX/DMG/PKG/HAP; firmware images (binwalk/unblob submodules); EVM bytecode; WASM; Go/Rust/Swift/ObjC/Dart-AOT/Flutter artifacts; .NET assemblies (PE/CLI metadata, no single-file hosts/IL2CPP); ASAR/Electron apps; JS bundles (Wakaru recovery); SQLite DBs; pcap/packet captures; signal recordings; iOS asset catalogs/keyed archives/Interface Builder files. Languages with dedicated modules: JavaScript, Go, Rust, Swift/ObjC, Dart, .NET CIL, EVM, WASM.

## 5. Known limitations (verified in docs/code)

1. **Bring-your-own-engine**: no bundled disassembler; heavy native work needs licensed/installed Ghidra/Hopper/IDA/JEB/Kuna. (`docs/installation.md`, `ida-provider.md`, `jeb-analysis.md`, `kuna-provider.md`)
2. **stdio transport only** for REA's own MCP server (no SSE/HTTP). (`src/main.ts`, `server.json`)
3. **10 MiB default MCP response budget**; large Evidence needs paging/export. (mcp-contracts.md)
4. **Windows Ghidra P0 is read-only**; no GUI controls anywhere; one provider bound per target, no auto-failover. (ghidra-provider.md, mcp-contracts.md)
5. **Honesty-by-design but not truth**: coverage fields explicitly go `unknown`/`truncated` rather than claiming completeness; decompilation "may be incomplete or incorrect" (DISCLAIMER.md). The legal disclaimer also forbids DRM/license/anti-cheat circumvention — **some legitimate RE tasks (license-check analysis) are out of scope for upstream support**.
6. **Runtime behavior**: process/browser/device observation executes real programs — "not a security sandbox" (session contract for `capture_process_scenario`).
7. **Setup is interactive** (approval prompts) unless fully flagged; Hopper install requires explicit approval.
8. Native-call/IDA facets: IDA declares facets its adapter can't provide; Hopper lacks reference-kind metadata; string search covers only tool-defined strings, not all byte sequences.

## 6. Test/CI evidence (verified)

1,413 `*.test.ts` files; vitest configs at repo root; CI workflows include **real-toolchain lanes** (`real-ghidra.yml`, `real-hopper.yml`, `real-cutter.yml`, …) meaning provider claims are exercised against actual engines in CI (per `docs/testing.md` admission criteria: "Provider and platform claims require their corresponding real verification lanes"). Mutation testing configured (stryker). I did **not** run the suite (audit-only).

## 7. Classification summary

- **VERIFIED**: repo exists & is active (clone + API + git log); MIT license; npm `rea-agents` 6.5.0; stdio MCP server (`rea mcp`); 131 MCP tools enumerated in code; 155 CLI commands; Evidence model fields and digest identity; error contract; deep-provider bring-your-own model (Ghidra/Hopper/IDA/Kuna/JEB/Cutter/Rizin/GDB/objdump); zero-engine JS/Electron/.NET static analysis; bundle export/import; no LLM/API-key requirement; Node 24; 10 MiB response budget; interactive setup for Claude Code/Codex/Cursor/Gemini CLI/Grok.
- **NEEDS-CONFIGURATION**: any *native* deep analysis (needs Ghidra/Hopper/IDA/JEB/Kuna installed + env config); Cutter bridge (running Cutter + plugin); Frida/ADB (devices); browser observation (Playwright browser binaries); larger MCP buffers (`REA_MCP_MAX_RESPONSE_BYTES`).
- **UNVERIFIED**: marketing claims on rea.tools (not audited); exact decompile *quality* vs. hand analysis; production performance/scale; the API's star/fork counts (anomalous — do not cite); Windows P0 beyond the docs; Termux/Android-host edge cases beyond documented notes.
