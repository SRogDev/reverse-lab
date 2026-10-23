# Reverse Lab

**Autonomous reverse engineering & experimental engineering laboratory for developers.**

Reverse Lab investigates how software systems work, reconstructs their architecture and behavior, identifies opportunities for improvement, builds alternative implementations, and validates them through real engineering experiments.

The user defines the engineering objective. Reverse Lab autonomously determines how to investigate it — which tools to use, which questions to answer, which experiments to run — and iterates toward a better solution. Every conclusion stays traceable to evidence or experimental results.

## Status

**MVP complete and validated locally (2026-10-16).** All 7 phases built on
local branches, integrated on `integrate/all`, and validated 15/15 on
`phase-7-validation` — see [STATUS.md](STATUS.md) and
[docs/validation.md](docs/validation.md) (every criterion exercised for real:
project → investigation → REA inspection → hypothesis → codegen →
sandboxed experiment → real comparison → conclusions → continue →
durability across restart → MCP).

- [x] Next.js 16 + strict TypeScript + Biome + vitest scaffold (build/lint/test green)
- [x] Shared domain contract (`src/types.ts`) — the verbatim shapes later phases depend on
- [x] Execution abstraction (`src/execution/`) — sandboxed `LocalExecutor`; `VercelSandboxExecutor` fails honestly until configured
- [x] REA CLI runner (`src/reverse-engineering/`) — real `rea-agents@6.5.0` evidence ingestion with `evidence_id` validation
- [x] Evidence store (`src/evidence/`) — `FileStore` (JSON, zero keys, works today); `SupabaseStore` is an honest stub until Roger provides keys (schema + RLS ship as `.sql` in `supabase/migrations/`)
- [x] Sample target + probe (`samples/mini-kv`, `npm run rea:probe`) — real REA output, verified
- [x] API routes per the contract below (incl. `POST /api/investigations/[id]/advance` and `/continue`)
- [x] Investigation engine — planner (deterministic), orchestrator (plan → execute → revise), model providers (scripted today; AI Gateway is an honest stub until the key exists)
- [x] Experiment runner (real measurements in the sandbox executor), codegen (`tsc --strict` in-executor), learning explanations (grounded, evidence-cited)
- [x] MCP server — 7 tools over stdio, see [MCP](#mcp-server-phase-6)
- [x] UI views — landing + Research Workspace + Investigation View + Knowledge Space

All work is local-only until the GitHub account suspension is resolved (see [STATUS.md](STATUS.md)). The 15 MVP acceptance criteria in [docs/product/mvp-scope.md](docs/product/mvp-scope.md) are the definition of done — **met 15/15**.

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
│   ├── capabilities/registry.ts  # closed, honest capability list (verified only)
│   ├── investigation-engine/     # planner (deterministic), orchestrator, model providers
│   ├── experiments/              # runner (real measurements), KV benchmark harness
│   ├── artifacts/codegen.ts      # deterministic TS alternatives (tsc-verified)
│   ├── artifacts/llm-codegen.ts  # contract-first LLM synthesis (real model only)
│   ├── learning/explain.ts       # grounded explanations (pure functions)
│   ├── services/lab.ts           # application services (routes + demo use these)
│   ├── demo/lab-investigate.ts   # npm run lab:investigate — real end-to-end demo
│   ├── lib/store.ts              # server store singleton (FileStore today)
│   ├── lib/api.ts                # typed fetch client for the UI (no deps)
│   ├── lib/stats.ts              # mean/min/max/n over recorded rawValues
│   ├── components/ui.tsx         # shared atoms: badges, evidence cards, states
│   ├── components/timeline.tsx   # plan-step timeline visualization
│   ├── mcp/                      # MCP server (Phase 6): 7 tools + stdio server + smoke
│   ├── app/api/                  # API routes per the contract below
│   └── app/                      # UI: page.tsx (landing), workspace/, investigation/[id]/, knowledge/[id]/
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

## API contract (Phases 1–4)

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/projects` | `{name, objective, constraints?}` | `201 {project}` |
| `GET /api/projects` | — | `{projects}` |
| `GET /api/projects/[id]` | — | `{project, targets, runs}` |
| `POST /api/projects/[id]/targets` | `{kind, ref}` | `201 {target}` |
| `POST /api/investigations` | `{projectId, objective?}` | `201 {run}` — planned, status `running` |
| `GET /api/investigations/[id]` | — | `{run}` |
| `POST /api/investigations/[id]/advance` | `{maxSteps?}` | `{run}` — executes pending plan steps |
| `POST /api/investigations/[id]/continue` | `{instruction}` | `{run}` — appends planned steps |
| `GET /api/investigations/[id]/results` | — | `{findings, evidence, hypotheses, conclusions}` |
| `GET /api/investigations/[id]/experiments` | — | `{experiments}` |
| `POST /api/experiments` | `{investigationId, spec}` | `201 {experiment}` |
| `POST /api/experiments/[id]/run` | — | `{run}` — ExperimentRun with real measurements |

Expected failures use `ServiceError` → `{error}` with 400 (validation), 404 (not found), or 409 (advancing a failed run — revise or continue instead). A step that fails twice marks the run `failed` with the error visible — never converted into a success.

## Investigation engine (Phases 3–4)

The autonomous loop, all real, zero keys:

- **Capability registry** (`src/capabilities/registry.ts`) — the closed list of what the lab can do: `rea-javascript-app` and `rea-sqlite` (verified against `rea-agents@6.5.0`), `rea-native` (`needs-configuration` — no engine installed, never scheduled), `codegen-typescript`, `codegen-llm-typescript` (`needs-configuration` in the same honest sense: it requires a real model provider — the deterministic scripted provider reports it *unavailable* rather than faking generated code), `experiment-run`. Nothing is invented; tests assert the exact set.
- **Planner** (`src/investigation-engine/planner.ts`) — deterministic: detects target-kind hints and intent keywords, selects registry capabilities, emits steps, questions, expected evidence, evaluation criteria, constraints, and limitations. Codegen is always ordered before experiment design (the spec needs the alternative to exist).
- **Orchestrator** (`src/investigation-engine/orchestrator.ts`) — `startInvestigation` (plan + persist + plan evidence), `advanceInvestigation` (sequential steps, one retry, then visible failure), `revisePlan` (keeps completed steps and all findings), `continueInvestigation` (appends instruction steps; hypotheses stay hypotheses).
- **Model providers** (`src/investigation-engine/model.ts`) — `ScriptedModelProvider` (deterministic, honestly labeled) and `AIGatewayProvider` (real calls via the verified `ai@7.0.142` `generateText`/`stepCountIs` and `@ai-sdk/gateway` `createGateway` exports; honest error until `AI_GATEWAY_API_KEY` is set — see `.env.example`).
- **Experiment runner** (`src/experiments/runner.ts`) — stages artifacts in a fresh sandbox cwd per run, executes the harness as a child process (scrubbed env, timeout), collects `spec.measurements × repetitions`, records full environment context (`nodeVersion`, `platform`, `arch`), `rawValues`, and `failures[]`. Comparisons are raw stats only (`n`, `mean`, `min`, `max`, `deltaVsReference`) — no composite scores.
- **Codegen — template** (`src/artifacts/codegen.ts`) — deterministic template transforms (MVP: `map-to-object-store` — Map-based KV → plain-object store with eager TTL sweep), typechecked with `tsc --strict` inside the executor (failure throws; no pseudo-code), registered as an `implementation` Artifact linked to the hypothesis.
- **Codegen — LLM synthesis** (`src/artifacts/llm-codegen.ts`) — the orchestrator can also throw real code: contract-first free-form TypeScript synthesis (plan §8: behavior to preserve, objective, constraints, required probe tests, evaluation procedure, target contract — fixed *before* generation), verified inside the executor (`tsc --strict` + contract probes) with a bounded repair loop (max 3 attempts). The planner selects it only when a real model provider is configured; with the scripted provider it reports *unavailable with a reason* and the plan keeps the template transform plus a recorded limitation. Generated code is untrusted: it only ever exists/executes inside the Executor sandbox, never in the lab process. **Honesty status: real-model quality is UNVERIFIED** — no live run has happened (no AI Gateway key); all behavioral tests use a fake provider through the `ModelProvider` seam. See [docs/architecture/llm-codegen.md](docs/architecture/llm-codegen.md). Full app reproduction remains the job of external coding agents (Claude Code/OpenCode); this capability is for investigation-grade implementations — small, contract-bound, experimentally testable.
- **Explanations** (`src/learning/explain.ts`) — pure functions grounded only in the data passed in; every claim cites evidence ids.

Run the demo: `npm run lab:investigate -- --objective "Investigate the mini-kv TTL implementation and build a simpler alternative" --target samples/mini-kv`. Real REA probe, real tsc, real measurements (~5 min; set `REA_BIN` to `node_modules/rea-agents/scripts/rea.mjs` — the default — to skip the slow npx bootstrap). Exits 0 on completion.

## UI (Phase 5)

The web UI is plain Next.js App Router + `fetch` (no data-fetching libraries).
Every view reads the real API above; views that need live state poll client-side.

| Route | View | Data |
|---|---|---|
| `/` | Landing — what the lab does, how investigations work, example objectives | static |
| `/workspace` | Research Workspace — project list + create form | `GET/POST /api/projects` |
| `/workspace/[id]` | Project detail — objective, targets, runs, start investigation | `GET /api/projects/[id]`, `POST …/targets`, `POST /api/investigations` |
| `/investigation/[id]` | Investigation View — live plan timeline (polls every 3 s), engine control, experiments | `GET /api/investigations/[id]`, `POST …/advance`, `POST …/continue`, `…/experiments`, `POST /api/experiments`, `POST /api/experiments/[id]/run` |
| `/knowledge/[id]` | Knowledge Space — findings↔evidence linkage, verification badges, experiment comparison, conclusions | `GET …/results`, `GET …/experiments` |

Design system (from `ui-ux-pro-max --design-system`): **Dark Mode (OLED)** —
background `#0F172A`, card `#1B2336`, accent "run green" `#22C55E`;
**Developer Mono** type pairing (JetBrains Mono headings/ids, IBM Plex Sans
body). Tokens live in `src/app/globals.css` as `--color-*` variables.

Honesty states in the UI: when the engine worker is offline the
Investigation View shows "engine offline" instead of faking progress;
limitations always render verbatim; the experiment comparison table computes
mean/min/max/n from recorded `rawValues` only (`src/lib/stats.ts`) and says
so when no runs exist. Failed steps and failed runs render with their error
text — never converted into apparent successes.

Component smoke tests (`src/**/__tests__/*.test.tsx`, jsdom) use **mock**
fixtures shaped like the real API responses — labeled as mocks in
`src/app/__tests__/fixtures.ts`. New measurement math is unit-tested in
`src/lib/stats.test.ts`.

## MCP server (Phase 6)

`src/mcp/` is an MCP server over stdio (`@modelcontextprotocol/sdk` 1.32.1,
verified API) exposing the lab to agents — including Polygrow — as 7
independent one-shot tools. They are thin adapters over the same `Store`
interface the API routes use. Every claim-bearing output includes
`evidence_ids` and `limitations`; there are no bare assertions.

| Tool | Input | Output |
|---|---|---|
| `create_research_project` | `{name, objective, constraints?}` | `{project}` |
| `start_investigation` | `{projectId, objective?}` | `{run}` — engine drafts a deterministic plan, records it as evidence, run status `running` |
| `get_investigation_status` | `{investigationId}` | `{run}` — status, `currentStep`, `plan` |
| `get_investigation_results` | `{investigationId}` | `{run, findings, evidence, hypotheses, conclusions}` |
| `list_research_findings` | `{investigationId, status?}` | `{findings}` |
| `get_experiment_results` | `{experimentId}` | `{experiment, runs}` |
| `continue_investigation` | `{investigationId, instruction}` | `{run}` — engine plans the instruction, appends steps, run status `running` |

```bash
npm run mcp:server  # serve over stdio (trust model: local machine)
npm run mcp:smoke   # drive all 7 tools with the real SDK client (exit 0, zero keys)
```

Trust boundary: stdio = local machine; the HTTP transport design (API-key
header, per-project scoping, RLS at the DB layer) is documented but not
implemented — see [docs/architecture/mcp-auth.md](docs/architecture/mcp-auth.md).
Polygrow integration guide (start → poll → fetch → continue, with a real
smoke transcript): [docs/integrations/mcp-polygrow.md](docs/integrations/mcp-polygrow.md).

## REA integration notes (verified, not assumed)

- The CLI `--json` output is a **flat** evidence record (`evidence_id`, `provider`, `normalized_result`, `limitations[]`, …). The `content[]`/`structuredContent` envelope in `docs/research/rea-integration.md` is the MCP shape; the parser codes against the real CLI shape (fixtures in `src/reverse-engineering/fixtures/`).
- `evidence_id` is validated against `/^ev_[0-9a-f]{64}$/` on ingest; lab evidence uses content-addressed `lab-ev-<sha256>` ids (dedup on re-ingest).
- `limitations[]` are stored and displayed verbatim — they are the honesty guarantees.
- `rea doctor` reports missing native engines in this environment (expected zero-engine state); static JS/SQLite analysis needs no engines.
- Under a minimal env, `npx -y rea-agents@6.5.0` takes ~70s to start; set `REA_BIN` to `node_modules/rea-agents/scripts/rea.mjs` (the real CLI entrypoint — note `dist/cli.js` is a library module and runs silently) or a global `rea` shim to skip npx (~13s). See `src/reverse-engineering/rea.ts`.

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
