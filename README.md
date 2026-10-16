# Reverse Lab

**Autonomous reverse engineering & experimental engineering laboratory for developers.**

Reverse Lab investigates how software systems work, reconstructs their architecture and behavior, identifies opportunities for improvement, builds alternative implementations, and validates them through real engineering experiments.

The user defines the engineering objective. Reverse Lab autonomously determines how to investigate it — which tools to use, which questions to answer, which experiments to run — and iterates toward a better solution. Every conclusion stays traceable to evidence or experimental results.

## Status

**Phase 1 — Technical Proof of Concept (building locally, 2026-10-16).**

Phase 0 (product & technical audit) is complete: REA is verified as the reverse-engineering engine (no pivot needed) and Vercel Sandbox is feasible for isolated execution. Phase 1 builds the technical foundation locally on branch `phase-1-foundation`:

- [x] Next.js 16 + strict TypeScript + Biome + vitest scaffold (build/lint/test green)
- [x] Shared domain contract (`src/types.ts`) — the verbatim shapes later phases depend on
- [x] Execution abstraction (`src/execution/`) — sandboxed `LocalExecutor`; `VercelSandboxExecutor` fails honestly until configured
- [x] REA CLI runner (`src/reverse-engineering/`) — real `rea-agents@6.5.0` evidence ingestion with `evidence_id` validation
- [x] Evidence store (`src/evidence/`) — `FileStore` (JSON, zero keys, works today); `SupabaseStore` is an honest stub until Roger provides keys
- [x] Sample target + probe (`samples/mini-kv`, `npm run rea:probe`) — real REA output, verified
- [x] API routes per the Phase 1 contract (see below)
- [ ] Investigation engine (Phase 3) — engine-dependent routes return honest `501`
- [ ] UI views, MCP server (Phases 5–6)

All work is local-only until the GitHub account suspension is resolved (see [STATUS.md](STATUS.md)). The 15 MVP acceptance criteria in [docs/product/mvp-scope.md](docs/product/mvp-scope.md) are the definition of done.

## Quickstart

Prerequisites: Node.js 24, npm 10.

```bash
npm install --legacy-peer-deps
npm run dev        # start the app (http://localhost:3000)
npm test           # vitest (unit + API smoke + live REA integration tests)
npm run lint       # Biome — must be clean
npm run build      # Next.js production build
npm run rea:probe  # run the real REA CLI over samples/mini-kv and print
                   # evidence_id + claims + limitations (nothing simulated)
```

Copy `.env.example` to `.env` when you need keys (AI Gateway, Supabase, Vercel). Phase 1 runs with zero keys — the `.env` file is gitignored and only `.env.example` (placeholders) is committed.

Data: the `FileStore` keeps JSON files under `data/` (gitignored). Override with `REVERSE_LAB_DATA_DIR` for tests or custom locations.

## Stack

- **App:** Next.js 16 (App Router) + React 19 + strict TypeScript
- **Lint/format:** Biome (zero errors enforced)
- **Tests:** vitest, colocated `*.test.ts`
- **Orchestration:** Vercel AI SDK + Vercel AI Gateway (Phase 3; env placeholders only)
- **Data:** `FileStore` today; Supabase (PostgreSQL + RLS) when keys exist — schema in `supabase/migrations/`
- **Isolated execution:** `LocalExecutor` today; Vercel Sandbox via the same `Executor` interface later
- **Reverse engineering:** REA (`rea-agents@6.5.0`, zero-engine CLI surface verified)
- **Integration:** MCP client + server (Phase 6)

## Repository structure

```
reverse-lab/
├── src/
│   ├── types.ts                  # shared domain contract (verbatim for later phases)
│   ├── execution/executor.ts     # Executor interface, LocalExecutor, VercelSandboxExecutor stub
│   ├── reverse-engineering/rea.ts# REA CLI runner + evidence mapping (+ fixtures)
│   ├── evidence/store.ts         # Store interface, FileStore, SupabaseStore stub
│   ├── lib/store.ts              # server store singleton (FileStore today)
│   └── app/api/                  # API routes per the contract below
├── samples/mini-kv/              # hand-written REA probe target (TS -> dist JS)
├── scripts/rea-probe.mjs         # npm run rea:probe — real REA over the sample
├── supabase/migrations/          # SQL schema + RLS (Phase 2; live connection later)
├── docs/
│   ├── PROJECT_BRIEF.md          # full handoff context for AI builders
│   ├── product/                  # vision, core workflows, MVP scope
│   ├── research/                 # REA audit, capability matrix, integration notes
│   ├── architecture/             # system architecture, data model, execution environments
│   ├── roadmap/                  # post-MVP direction
│   └── commercial/               # monetization strategy (docs only, no implementation)
├── .env.example                  # placeholder keys (never real values)
├── AGENTS.md                     # working agreement for AI contributors
├── STATUS.md                     # current status and timeline
└── LICENSE                       # MIT
```

## API contract (Phase 1)

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/projects` | `{name, objective, constraints?}` | `{project}` |
| `GET /api/projects` | — | `{projects}` |
| `GET /api/projects/[id]` | — | `{project, targets, runs}` |
| `POST /api/projects/[id]/targets` | `{kind, ref}` | `{target}` |
| `POST /api/investigations` | `{projectId, objective?}` | `{run}` |
| `GET /api/investigations/[id]` | — | `{run}` |
| `POST /api/investigations/[id]/continue` | `{instruction}` | `501` — engine not yet implemented |
| `GET /api/investigations/[id]/results` | — | `{findings, evidence, hypotheses, conclusions}` |
| `GET /api/investigations/[id]/experiments` | — | `{experiments}` |
| `POST /api/experiments` | `{investigationId, spec}` | `{experiment}` |
| `POST /api/experiments/[id]/run` | — | `501` — engine not yet implemented |

Engine-dependent routes return honest `501 {error: "investigation engine not yet implemented"}` — never faked success.

## REA integration notes (verified, not assumed)

- The CLI `--json` output is a **flat** evidence record (`evidence_id`, `provider`, `normalized_result`, `limitations[]`, …). The `content[]`/`structuredContent` envelope in `docs/research/rea-integration.md` is the MCP shape; the parser codes against the real CLI shape (fixtures in `src/reverse-engineering/fixtures/`).
- `evidence_id` is validated against `/^ev_[0-9a-f]{64}$/` on ingest; lab evidence uses content-addressed `lab-ev-<sha256>` ids (dedup on re-ingest).
- `limitations[]` are stored and displayed verbatim — they are the honesty guarantees.
- `rea doctor` reports missing native engines in this environment (expected zero-engine state); static JS/SQLite analysis needs no engines.
- Under a minimal env, `npx -y rea-agents@6.5.0` takes ~70s to start; set `REA_BIN` to a pre-installed `rea` binary to skip npx (~5s). See `src/reverse-engineering/rea.ts`.

## Documentation

- [Project brief](docs/PROJECT_BRIEF.md) — start here if you are an AI agent picking up this project
- [Product docs](docs/product/) — vision, workflows, MVP scope and acceptance criteria
- [Research](docs/research/) — reverse-engineering capability audits (verified vs unverified)
- [Architecture](docs/architecture/) — system design, data model, execution-environment findings
- [Roadmap](docs/roadmap/post-mvp.md) — what comes after the MVP
- [Commercial](docs/commercial/) — monetization strategy, documented only

## Principles

- **Evidence over assertions** — inferred internals are never presented as observed facts.
- **Experiments over unsupported claims** — improvements are tested under documented conditions, never simulated.
- **Small, complete workflows** over broad, incomplete features.
- **Failures are explicit** — a failed tool call or experiment is never silently converted into success.
- **Honest stubs** — unconfigured integrations throw descriptive errors; they never fake success.

## License

MIT — see [LICENSE](LICENSE).
