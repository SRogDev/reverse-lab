# STATUS.md — Reverse Lab

## Current

**LOCAL-ONLY FULL BUILD IN PROGRESS** (Roger's explicit order 2026-10-16 ~01:12 CDT: "termina y guarda ahí en tu ordenador todo el proyecto de reverse lab sin miedo")

- **Phase 0 COMPLETE** — all docs finished locally: foundation (PR #1, merged `94bdf5f`), product docs (PR #2, merged `7d7e686`), REA research docs + architecture/roadmap/commercial docs (PRs #3/#4, complete and staged locally, unpushed — see BLOCKED below).
- **Phases 1–7 now building locally** with zero GitHub API calls. One local branch per logical change (they become PRs once the account is restored). Skipping "compromising parts" per Roger's order: no commercial/billing internals in code, nothing requiring his keys/accounts/decisions (Supabase project, Vercel deploy, AI Gateway keys — env placeholders + setup docs only).
- The 15 MVP acceptance criteria in `docs/product/mvp-scope.md` are the definition of done.

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
| 2026-10-16 | Phase 1 foundation built locally (branch `phase-1-foundation`): domain types, sandboxed executor, REA CLI runner + evidence mapping, FileStore, samples/mini-kv + `npm run rea:probe`, API routes per contract — build/lint/test green, 0 keys |

## Roadmap phases

- [x] Phase 0 — Product & Technical Audit (complete; findings: REA verified, Sandbox feasible)
- [ ] Phase 1 — Technical Proof of Concept (foundation complete locally: types, executor, REA runner, FileStore, probe, API routes; engine/UI/MCP are later phases)
- [ ] Phase 2 — Core Data Model & Persistence (building locally; SQL migrations + RLS, no live Supabase)
- [ ] Phase 3 — Investigation Engine (queued)
- [ ] Phase 4 — Experimental Engineering (queued)
- [ ] Phase 5 — Application UI (queued)
- [ ] Phase 6 — MCP Integration (queued)
- [ ] Phase 7 — MVP Validation (queued)
- [ ] Phase 8 — Future Commercialization (out of MVP; docs only)

## Decisions (Roger's)

- Repo is **public** (explicit order 2026-10-16; the original plan said "initially private").
- License **MIT** (default for portfolio showpieces; Roger can change it).

## Pending / needs Roger (unchanged — nothing here blocks local work)

- GitHub suspension appeal (account SRogDev) — after restore: push staged PRs #3/#4, then open PRs from the local phase branches.
- CI via `.github/workflows/*` needs a full-scope token (stored token lacks the `workflows` scope).
- Supabase project + keys (schema + RLS ship as .sql; live connection later).
- Vercel project/token for Sandbox execution (LocalExecutor works now; swap later).
- AI Gateway key + model selection/budgets (env placeholders + setup docs; orchestrator runs on a scripted provider until then).

## BLOCKED (2026-10-16 ~04:53 UTC)

- GitHub API now returns **403 "Sorry. Your account was suspended"** on every endpoint
  (read and write, via the stored token acting as SRogDev). PRs #1 and #2 merged
  minutes earlier; no further API calls are being made.
- **Not lost:** PR #3 (docs/research/rea-*.md) and PR #4 (docs/architecture/*,
  docs/roadmap/post-mvp.md, docs/commercial/*.md) are complete and staged in the
  local workdir `~/workspace/reverse-lab/` (10 files, `git status` clean-staged).
  Push them as PRs #3 and #4 once API access is restored.
- **Next step for Roger:** check for a GitHub suspension/abuse notice (account email,
  https://github.com/settings); the flag may be temporary (automation detection).
  If the account is genuinely suspended, appeal via GitHub Support. Retry the
  pending pushes after access is restored — no rework needed.
