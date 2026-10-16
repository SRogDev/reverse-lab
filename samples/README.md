# Samples

Small, hand-written reverse-engineering targets for the REA probe
(`npm run rea:probe`). Nothing here is production code — these exist so the
lab can exercise real REA capabilities end to end.

## mini-kv

`mini-kv/` — a tiny in-memory key-value store with TTL (`src/index.ts`,
compiled to `dist/` via `npx tsc -p samples/mini-kv`; `dist/` is committed
so REA analyzes the shipped JS without a build step).

- `MiniKV`: `set`/`get`/`has`/`delete`/`sweep`/`keys`/`size`/`clear`,
  wall-clock TTL (`Date.now()`), lazy expiry on read.
- `createStore`: convenience factory.

## Verification status (this environment, 2026-10-16)

- **VERIFIED:** `rea analyze-javascript-application samples/mini-kv --json`
  runs against the real `rea-agents@6.5.0` CLI (exit 0), returns a flat
  evidence record with a valid `ev_<sha256>` id, 5 verbatim limitations,
  and a real semantic graph (32 nodes for the probe app; mini-kv is
  larger). Run `npm run rea:probe` to reproduce.
- **VERIFIED:** `rea inspect-sqlite-database` over a generated sample DB
  (sqlite3 3.45.1 present on this machine) — exercised by the probe script
  when `sqlite3` exists.
- **UNVERIFIED-in-this-env:** native deep analysis (`rea analyze --provider
  ghidra`, `decompile`, …) — no native engines installed; `rea doctor`
  reports them missing, which is the expected zero-engine state.

## Notes

- The CLI `--json` output is a **flat** evidence record. The `content[]` /
  `structuredContent` envelope in `docs/research/rea-integration.md` §2 is
  the MCP shape; the parser in `src/reverse-engineering/rea.ts` codes
  against the real CLI shape (fixtures in
  `src/reverse-engineering/fixtures/`).
- Under a minimal env (PATH/HOME/LANG only), `npx -y rea-agents@6.5.0`
  takes ~70s before REA starts (npx overhead, verified). Set `REA_BIN` to a
  pre-installed `rea` binary (e.g. the `scripts/rea.mjs` inside an
  installed `rea-agents` package) to invoke it directly (~5s).
