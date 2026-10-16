# STATUS.md — Reverse Lab

## Current

**Phase 0: Product & Technical Audit — IN PROGRESS** (started 2026-10-16)

The repository holds product and research documentation only. No application code exists yet. Phase 0 validates the technical assumptions (reverse-engineering capabilities, execution environment, architecture) before any implementation begins.

## Timeline

| Date       | Event                                                                                          |
|------------|------------------------------------------------------------------------------------------------|
| 2026-10-16 | Repo created (public, MIT). Phase 0 started.                                                    |
| 2026-10-16 | Foundation docs (PR #1): README, AGENTS.md, STATUS.md, docs/PROJECT_BRIEF.md                   |
| 2026-10-16 | Product docs (PR #2): vision, core workflows, MVP scope                                         |
| 2026-10-16 | REA research docs (PR #3): audit, capability matrix, integration (or pivot)                     |
| 2026-10-16 | Architecture + roadmap + commercial docs (PR #4)                                                |
| 2026-10-16 | MCP server (Phase 6, branch `phase-6-mcp`): 7 tools over stdio, smoke green, auth design + Polygrow integration docs |

## Roadmap phases

- [x] Phase 0 — Product & Technical Audit (in progress)
- [ ] Phase 1 — Technical Proof of Concept
- [ ] Phase 2 — Core Data Model & Persistence
- [ ] Phase 3 — Investigation Engine
- [ ] Phase 4 — Experimental Engineering
- [ ] Phase 5 — Application UI
- [x] Phase 6 — MCP Integration (built on branch `phase-6-mcp`, 2026-10-16)
- [ ] Phase 7 — MVP Validation
- [ ] Phase 8 — Future Commercialization (out of MVP)

## Decisions (Roger's)

- Repo is **public** (explicit order 2026-10-16; the original plan said "initially private").
- License **MIT** (default for portfolio showpieces; Roger can change it).

## Pending / needs Roger

- Phase 0 findings review → go/no-go for Phase 1. Findings will be presented; Phase 1 does **not** auto-start.
- REA vs alternative tooling decision, after the audit lands (PR #3).
- CI via `.github/workflows/*` needs a full-scope token (stored token lacks the `workflows` scope).
- Supabase project + keys (needed in Phase 2).
