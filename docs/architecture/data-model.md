# Data Model — Reverse Lab

Phase 2. The SQL is the source of truth (`supabase/migrations/`); this document
explains it. Live-exercised on PostgreSQL 16.15, 2026-10-16 — 46-assertion smoke
suite (see `supabase/README.md`), all passing.

## Design principles

1. **Evidence is relational, not a blob.** Findings, hypotheses, experiments, and
   conclusions are rows with explicit relationships, because the product must
   query them, authorize them per user (RLS), and trace conclusions to evidence.
2. **The project is the ownership root.** Every table resolves its owner through
   `research_projects.owner_id` (directly or via `investigation_runs`), so one
   RLS policy shape covers the whole schema.
3. **Observed vs inferred is a first-class distinction** (`evidence.verification`),
   per the architecture invariant: "Observed behavior and inferred internals are
   stored and displayed separately."
4. **Failures stay visible.** `investigation_runs.error`, `experiment_runs.failures`,
   and the full status vocabulary (`failed`, `blocked`, `needs-evaluation`) are
   stored, never converted into apparent successes.
5. **No measurement without context.** `experiment_runs` requires `environment`
   and `raw_values`; summarized-only numbers have nowhere to hide.

## Entity-relationship diagram

```
research_projects ──┬── research_targets
 (owner_id)         ├── research_questions
                    └── investigation_runs ──┬── investigation_steps
                                             ├── evidence
                                             ├── findings ──(evidence_ids → evidence)
                                             ├── hypotheses ─(evidence_ids → evidence)
                                             │       └── experiments ──(hypothesis_id)
                                             │                └── experiment_runs
                                             ├── artifacts
                                             └── conclusions ─(evidence_ids → evidence)

usage_records (Phase-8 reserved; owner_id only, no app logic)
```

All child FKs are `ON DELETE CASCADE` from the project chain — deleting a
project removes everything derived from it (verified in the smoke suite).
The single exception: `experiments.hypothesis_id` is `ON DELETE SET NULL`
(the experiment record survives even if its hypothesis is removed).

## Tables

| Table | Key columns | Relationships |
|---|---|---|
| `research_projects` | `id` uuid PK · `owner_id` uuid (RLS anchor) · `objective` · `constraints` text[] · `updated_at` | root |
| `research_targets` | `kind` ∈ repo/component/feature/product/docs/article/benchmark/experiment · `ref` | → projects (cascade) |
| `research_questions` | `question` · `status` default 'open' | → projects (cascade) |
| `investigation_runs` | `objective` · `status` run_status · `plan` jsonb · `current_step` · `error` · `updated_at` | → projects (cascade) |
| `investigation_steps` | `title` · `status` run_status · `started_at`/`finished_at` | → runs (cascade) |
| `evidence` | `id` text PK content-addressed · `type` · `source` · `observation` · `producer` jsonb · `raw` jsonb · `limitations` text[] · `verification` ∈ observed/source-fact/third-party/measured/hypothesis/inferred · `coverage` jsonb · `provenance` jsonb · `supersedes` text[] | → runs (cascade) |
| `findings` | `title` · `body` · `evidence_ids` text[] · `status` ∈ provisional/confirmed/refuted | → runs (cascade) |
| `hypotheses` | `statement` · `status` ∈ proposed/testing/supported/refuted · `evidence_ids` text[] | → runs (cascade) |
| `experiments` | `objective` · `hypothesis_id` nullable · `spec` jsonb | → runs (cascade) · → hypotheses (set null) |
| `experiment_runs` | `status` run_status · `environment` jsonb · `raw_values` jsonb · `failures` text[] · `notes` | → experiments (cascade) |
| `artifacts` | `kind` ∈ implementation/report/test-result · `path` · `description` | → runs (cascade) |
| `conclusions` | `statement` · `evidence_ids` text[] · `limitations` text[] | → runs (cascade) |
| `usage_records` | `owner_id` · `investigation_id` nullable · `kind` · `quantity` | Phase-8 reserved; inert |

Indexes exist on every `*_id` FK column, plus `(investigation_id)` on
evidence/findings/hypotheses/experiments/artifacts/conclusions, and on
`evidence(verification)` for the observed/inferred split queries.

## Why `evidence.id` is text, not uuid

It is **content-addressed**, not surrogate. The format `ev_<sha256>` /
`lab-ev_<sha256>` (enforced by a `CHECK` regex) matches REA's `evidence_id`
(`docs/research/rea-integration.md` §3): the id is the digest of the canonical
record, so the same observation ingested twice **deduplicates for free**, and a
client can verify record integrity cheaply by recomputing the hash. A uuid would
lose both properties. `producer`, `raw`, `limitations[]`, `coverage`,
`provenance`, and `supersedes` complete the 1:1 REA mapping.

## RLS model

- `REVOKE ALL` from `anon`/`authenticated` first; explicit CRUD grants to
  `authenticated` only; `anon` gets nothing.
- RLS enabled on all 13 tables; 52 policies (select/insert/update/delete × table),
  all owner-based through the project chain.
- Helpers: `is_project_owner(uuid)` and `investigation_project_id(uuid)`,
  both `SECURITY DEFINER`.
- `auth.uid()` always as `(select auth.uid())`.
- `service_role` bypasses RLS — the server orchestrator is trusted code and the
  enforcement point for service_role writes.

## What is deliberately NOT here

- **No FK from `owner_id` to `auth.users`.** Supabase's auth schema lives outside
  the app's migration control; a hard FK would couple deployments to auth
  internals. Deferred until the project is linked.
- **No multi-user sharing.** Single-owner model for the MVP; a
  `project_members` join table is the planned extension point.
- **No views.** They would bypass RLS through PostgREST (security-definer
  default). Analytics views arrive with `security_invoker` or not at all.
- **No billing logic.** `usage_records` is schema-only for Phase 8.
