# AGENTS.md — Reverse Lab working agreement

## Workflow (Roger's rules)

- Every change ships as a PR against `main`. One PR = one logical change.
- Squash-merge keeps `main` linear — one clean commit per change.
- Muse merges his own PRs (explicitly authorized by Roger). Never push directly to `main`.
- Every significant change ships a README touch-up in the same PR. READMEs stay in English and current.

## Language

- Docs and code: English.
- Discussion with Roger: Spanish.

## Repo docs standard

- `AGENTS.md` (this file), `STATUS.md` (done/doing/next timeline), `docs/PROJECT_BRIEF.md` (full context for handoff to another AI). Keep them current — update STATUS.md in the same PR when a milestone completes.

## Honesty rules (binding)

- Never invent capabilities, API contracts, benchmark results, or infrastructure limits.
- Anything not verified against real code or real docs is marked **UNVERIFIED**.
- Experimental results are never fabricated or simulated. A failed run stays visible as failed.

## Constraints

- The stored GitHub token lacks the `workflows` scope: never push `.github/workflows/*` via API. CI setup waits for Roger (full-scope token).
- No GPU-dependent workflows in the MVP.
- No LangGraph unless a demonstrated requirement justifies it.
- No public plugin SDK / marketplace in the MVP.
- Monetization is docs-only until Phase 8.

## Decisions log

- 2026-10-16: repo is **PUBLIC** per Roger's explicit order (the original plan said "initially private"; Roger overrode it).
- 2026-10-16: **MIT** license — Roger's default for portfolio showpieces; he can change it.
