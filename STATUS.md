# STATUS.md — Reverse Lab

## Current

**LOCAL-ONLY FULL BUILD COMPLETE + MVP VALIDATED 15/15** (Roger's explicit order 2026-10-16 ~01:12 CDT: "termina y guarda ahí en tu ordenador todo el proyecto de reverse lab sin miedo")

- **Phase 0 COMPLETE** — all docs finished locally: foundation (PR #1, merged `94bdf5f`), product docs (PR #2, merged `7d7e686`), REA research docs + architecture/roadmap/commercial docs (PRs #3/#4, complete and staged locally, unpushed — see BLOCKED below).
- **Phases 1–6 built locally and INTEGRATED** on branch `integrate/all` with zero GitHub API calls.
- **Phase 7 VALIDATION COMPLETE (2026-10-16, branch `phase-7-validation`): all 15 MVP acceptance criteria PASS**, each exercised for real against the build — evidence in [docs/validation.md](docs/validation.md). Validation found and fixed one real bug (commit `33f8238`): the engine registered an inspected *directory* as the experiment reference artifact and the runner failed with EISDIR — directory targets now resolve to a runnable entrypoint (`dist/index.js` …), and experiment design refuses honestly otherwise.
- Skipping "compromising parts" per Roger's order: no commercial/billing internals in code, nothing requiring his keys/accounts/decisions (Supabase project, Vercel deploy, AI Gateway keys — env placeholders + setup docs only).
- The 15 MVP acceptance criteria in `docs/product/mvp-scope.md` are the definition of done — **met**.
- **LLM codegen ADDED (2026-10-23, local branch `feat/llm-codegen`, Roger's decision: single orchestrator confirmed over multi-agent):** the orchestrator can now throw real code — `src/artifacts/llm-codegen.ts` does contract-first free-form TS synthesis (plan §8 contract fixed before generation), verified in the Executor sandbox (`tsc --strict` + contract probes) with a bounded repair loop (max 3 attempts), registered as capability `codegen-llm-typescript`. Honesty gates: the scripted provider reports the capability *unavailable* (never called, zero files written); the planner selects synthesis only when a real provider is wired (`canSynthesize`), otherwise keeps the template transform and records the limitation. **UNVERIFIED: real-model quality — no live run (no AI Gateway key); all tests use a fake provider.** Commits: `c90a896` (module + tests), `705e5ca` (registry/planner/orchestrator/services wiring), `7fc2440` (biome fix), docs commit. **Verified 2026-10-23: `npm test` 31 files, 192/192 pass (baseline was 183/183); `npx tsc --noEmit` clean for all project source; `npm run build` exit 0 in a clean checkout of the branch.** In the working tree, `tsc`/`build`/`lint` additionally report pre-existing errors inside the UNTRACKED `vendor/replica-skill/` tree (missing `@playwright/test` etc.) — untouched per instructions, present against `main` too. See docs/architecture/llm-codegen.md. Template codegen unchanged. Awaiting Roger's key for the first live synthesis run + golden-set scoring.

## Integration (branch `integrate/all`, 2026-10-16)

Merged in order, conflicts resolved with real judgment:

1. `phase-1-foundation` — domain types, sandboxed executor, REA CLI runner + evidence mapping, FileStore, API routes, samples/mini-kv
2. `phase-2-data-model` — supabase/ migrations + RLS + seed, Phase-0 research/architecture/commercial docs
3. `phase-3-4-engine` — capabilities, planner, orchestrator, ModelProvider, experiment runner, codegen, learning, `src/services/lab.ts`; API routes refactored onto services (+ `POST /api/investigations/[id]/advance`)
4. `phase-5-ui` — landing + Research Workspace + Investigation View + Knowledge Space (package.json union: jsdom + testing-library)
5. `phase-6-mcp` — `src/mcp/` (7 tools, stdio server, real-SDK smoke), `@modelcontextprotocol/sdk` + zod; `src/evidence/store.ts` unified to ONE `listExperimentRuns` (engine's `getArtifact`/`listArtifacts` kept — the orchestrator and services use them); explicit `.ts` import style under `allowImportingTsExtensions`
6. `docs/status-local-build` — STATUS.md base (this file)

**Rewire:** `start_investigation` / `continue_investigation` in `src/mcp/tools.ts` delegate to the real engine services (`getServices()`); `ServiceError` → `ToolError` codes. Verified live: MCP smoke shows status `running` with a 4-step engine-drafted plan. 5 stale tool tests updated to assert the new real behavior (15/15 pass).

**Verification (all on `integrate/all`, zero keys, zero network for the app itself):**

| Check | Result |
|---|---|
| `npm install --legacy-peer-deps` | ✅ 363 packages (union: `ai`, `@ai-sdk/gateway`, `@modelcontextprotocol/sdk`, `zod`, `tsx`, `rea-agents`, testing-library) |
| `npx tsc --noEmit` | ✅ clean (strict) |
| `npx biome check .` | ✅ zero (fixed 2 pre-existing engine issues: unused import, implicit-any) |
| `npm run build` | ✅ exit 0 — 17 routes (incl. `/api/investigations/[id]/advance`, UI pages) |
| `npm test` (excl. `rea.test.ts`) | ✅ **29 files, 172 tests, all pass** (362s — real benchmarks) |
| `src/reverse-engineering/rea.test.ts` | ⚠️ excluded: live tests hang on `npx -y rea-agents` network download in sandbox; fixture tests pass 4/4. Tests kept, not deleted. |
| `npm run rea:probe` | ✅ exit 0 — real REA output, real `ev_…` evidence ids |
| `npm run mcp:smoke` | ✅ exit 0 over real stdio (7 tools, bad-id → isError) |
| `npm run lab:investigate` | ✅ exit 0 — DEMO OK; real measurements: reference wall_time_ms mean 30.4ms vs alternative 61,404ms (honest finding: the "simpler" alternative is ~2000× slower); 1 harness timeout recorded as a failure, run retried and completed |
| dev server HTTP flow | ✅ `GET /` → 200; `/api/projects` → 200; create → start → advance → results → 200s with real data |

## Timeline

| Date       | Event                                                                                          |
|------------|------------------------------------------------------------------------------------------------|
| 2026-10-16 | Repo created (public, MIT). Phase 0 started.                                                    |
| 2026-10-16 | Foundation docs (PR #1): README, AGENTS.md, STATUS.md, docs/PROJECT_BRIEF.md                   |
| 2026-10-16 | Product docs (PR #2): vision, core workflows, MVP scope                                         |
| 2026-10-16 | REA research docs (PR #3): audit, capability matrix, integration — staged locally               |
| 2026-10-16 | Architecture + roadmap + commercial docs (PR #4) — staged locally                              |
| 2026-10-16 | Phase 0 findings: REA VERIFIED (no pivot), Vercel Sandbox feasible for PoC                      |
| 2026-10-16 | Roger ordered full local build (Phases 1–7), skipping compromising parts                       |
| 2026-10-16 | Phases 1–6 built locally, one branch per phase                                                  |
| 2026-10-16 | **Integrated on `integrate/all`**: 6 merges + MCP→engine rewire; verification all green (above) |

## Roadmap phases

- [x] Phase 0 — Product & Technical Audit (complete; findings: REA verified, Sandbox feasible)
- [x] Phase 1 — Technical Proof of Concept (types, executor, REA runner, FileStore, probe, API routes)
- [x] Phase 2 — Core Data Model & Persistence (migrations + RLS + seed as `.sql`; no live Supabase)
- [x] Phase 3 — Investigation Engine (planner, orchestrator, model providers, `src/services/lab.ts`)
- [x] Phase 4 — Experimental Engineering (runner with real measurements, codegen, learning)
- [x] Phase 5 — Application UI (landing + 3 views, honesty states)
- [x] Phase 6 — MCP Integration (7 tools, smoke green, rewired onto engine services)
- [x] Phase 7 — MVP Validation (15/15 criteria exercised live on `phase-7-validation`; [docs/validation.md](docs/validation.md); engine bug found + fixed)
- [ ] Phase 8 — Future Commercialization (out of MVP; docs only)

## Branch ledger (local; become PRs once the account is restored)

| Branch | Contents |
|---|---|
| `phase-1-foundation` | app scaffold, types, executor, REA runner, FileStore, API routes, samples |
| `phase-2-data-model` | supabase/ migrations + RLS + seed; Phase-0 docs sweep |
| `phase-3-4-engine` | capabilities, planner, orchestrator, ModelProvider, experiment runner, codegen, learning, services, refactored API routes, `lab:investigate` demo |
| `phase-5-ui` | landing + 3 views, design tokens, component tests |
| `phase-6-mcp` | `src/mcp/` server + 7 tools + smoke, MCP docs |
| `integrate/all` | **all of the above merged + rewire + verification** (this build) |
| `phase-7-validation` | **validation of the integrated build**: 15/15 MVP criteria exercised live ([docs/validation.md](docs/validation.md)); engine bug fix (directory→entrypoint reference resolution, commit `33f8238`); STATUS/README final |

Phase branches stay pristine for their future PRs; all integration work lives on `integrate/all` only; validation work lives on `phase-7-validation` only.

## Phase 7 validation summary (2026-10-16, all on `phase-7-validation`, zero keys)

| Check | Result |
|---|---|
| 15/15 MVP criteria | ✅ all PASS — each exercised for real (see [docs/validation.md](docs/validation.md)) |
| `npm test` | ✅ **30 files, 183 tests, all pass** |
| `npx tsc --noEmit` | ✅ clean (strict) |
| `npx biome check .` | ✅ clean (92 files) |
| `npm run build` | ✅ exit 0 |
| `npm run rea:probe` | ✅ exit 0 — real REA output, real `ev_…` ids, verbatim limitations |
| `npm run mcp:smoke` | ✅ exit 0 over real stdio (7 tools, bad-id → isError) |
| `npm run lab:investigate` | ✅ exit 0 — DEMO OK; reference wall_time_ms mean 18.760ms (n=5) vs alternative 45,233.864ms (n=5); correctness 1.000 both |
| dev server HTTP flow | ✅ create → start → advance (8/8 steps) → results → continue (8→15 steps) → stop/restart → identical data from disk |
| Failed runs visibility | ✅ failed investigation keeps `status: failed` + error text; failed experiment run keeps `failures[]` (recorded 120s harness timeout) |
| No invented scores | ✅ spot-checked stats/runner/explain/knowledge view/comparison outputs — raw n/mean/min/max only |

Honest partials: Supabase persistence validated at SQL/RLS level only (no live project — needs Roger's keys); AI Gateway provider is an honest stub (deterministic scripted provider used); Vercel Sandbox executor is an honest stub (LocalExecutor validated: fresh sandbox cwd, scrubbed env, timeouts).

## Decisions (Roger's)

- Repo is **public** (explicit order 2026-10-16; the original plan said "initially private").
- License **MIT** (default for portfolio showpieces; Roger can change it).

## Pending / needs Roger (unchanged — nothing here blocks local work)

- GitHub suspension appeal (account SRogDev) — after restore: push staged PRs #3/#4, then open PRs from the local phase branches (ledger above).
- CI via `.github/workflows/*` needs a full-scope token (stored token lacks the `workflows` scope).
- Supabase project + keys (schema + RLS ship as .sql; live connection later).
- Vercel project/token for Sandbox execution (LocalExecutor works now; swap later).
- AI Gateway key + model selection/budgets (env placeholders + setup docs; orchestrator runs on a scripted provider until then).

## BLOCKED (2026-10-16 ~00:53 CDT)

- GitHub API returns **403 "Sorry. Your account was suspended"** on every endpoint
  (read and write, via the stored token acting as SRogDev). PRs #1 and #2 merged
  minutes earlier; **zero GitHub API calls since** — no retries, no workarounds.
- **Not lost:** PR #3 (docs/research/rea-*.md) and PR #4 (docs/architecture/*,
  docs/roadmap/post-mvp.md, docs/commercial/*.md) are complete and staged in the
  local workdir `~/workspace/reverse-lab/` (10 files). Push them as PRs #3 and #4
  once API access is restored, then open PRs from the phase branches above.
- **Next step for Roger:** appeal via https://support.github.com/contact in incognito
  ("Account suspended or restricted"); one ticket only, do NOT create a new account.
  Email to support@github.com is blocked by recipient policy — use the form.
  Form SMS verification may need a relative abroad (US SMS often can't reach +53).
