# Supabase — Reverse Lab data layer

Schema for the Reverse Lab MVP: research projects, investigations, REA-compatible
evidence, experiments, artifacts, conclusions. Billing (`usage_records`) is a
Phase-8 placeholder: the table exists, nothing reads or writes it.

## Layout

| Path | Purpose |
|---|---|
| `migrations/20261016000001_init.sql` | Tables, domains, FK cascades, indexes, `updated_at` trigger |
| `migrations/20261016000002_rls.sql` | RLS: grant hygiene + policies on every table |
| `seed.sql` | DEMO data only (fictional "demo-mini-kv" project) |
| `README.md` | This file |

## Apply

**Order matters:** `01_init` → `02_rls` → (optional) `seed`.

With the Supabase CLI against a linked project:

```bash
supabase db push        # applies migrations in timestamp order
supabase db reset       # local dev: rebuilds + applies seed.sql
```

With plain `psql` / the SQL editor (no CLI):

```sql
-- run in order:
--   1. migrations/20261016000001_init.sql
--   2. migrations/20261016000002_rls.sql
--   3. (dev only) seed.sql
```

The `anon` and `authenticated` roles exist in every Supabase project, so the
`REVOKE`/`GRANT` statements in `02_rls` apply as-is.

## RLS checklist (satisfied)

From `docs/architecture/execution-environments.md` §6.1 — per-table checklist:

- [x] **Revoke before policies.** `02_rls` starts with `REVOKE ALL ... FROM anon, authenticated`
      on all 13 tables. Policies alone do not remove the default grants.
- [x] **Explicit grants after.** `authenticated` gets `SELECT, INSERT, UPDATE, DELETE`
      on all 13 tables. `anon` gets nothing.
- [x] **RLS enabled on EVERY table.** All 13 tables (`research_projects`,
      `research_targets`, `research_questions`, `investigation_runs`,
      `investigation_steps`, `evidence`, `findings`, `hypotheses`,
      `experiments`, `experiment_runs`, `artifacts`, `conclusions`,
      `usage_records`).
- [x] **One policy per operation** (select/insert/update/delete) per table — 52 policies.
      `FOR UPDATE` carries both `USING` and `WITH CHECK` so a row cannot be
      moved into another owner's project.
- [x] **`auth.uid()` wrapped in a subselect** `(select auth.uid())` everywhere —
      evaluated once per query, not per row.
- [x] **Ownership through the project chain.** `research_projects.owner_id` is the
      anchor; helpers `is_project_owner(uuid)` and `investigation_project_id(uuid)`
      (both `SECURITY DEFINER`, `SET search_path = public`) resolve child-table
      ownership without RLS recursion.
- [x] **No views.** (Views default to security-definer and bypass RLS via
      PostgREST.) If analytics views are added later, they must be
      `security_invoker` or kept out of the exposed schema.
- [x] **Assertions.** Live-exercised (see below): RLS on/off per table,
      policy count, grant state, and real tenant-isolation queries.

**Trust boundary:** `service_role` bypasses RLS by design. The server-side
investigation orchestrator uses `service_role` and is therefore trusted code —
it must enforce ownership in application logic. Browser/edge code uses the anon
key only.

## Verification status

**Live-exercised on PostgreSQL 16.15** (local cluster, 2026-10-16): both
migrations + seed applied cleanly in order; 46-assertion smoke suite passed —
chain insert, `updated_at` trigger, all domain/CHECK/FK violations rejected,
cascades across all child tables, RLS enabled on all 13 tables, 52 policies,
anon revoked, and tenant isolation verified with two roles and JWT-claim
simulation (`auth.uid()` shim reproducing Supabase's claim resolution).
`auth.uid()` itself was **not** exercised against a real Supabase instance —
that needs Roger's project (below).

## What needs Roger

1. **A Supabase project** (create at supabase.com) — no project exists yet.
2. **Keys:** the anon key for the app and the service_role key for the
   server-side orchestrator (stored in the Secure Vault, never in the repo).
3. Then `supabase link` + `supabase db push`, or paste the migrations into the
   SQL editor in order.
4. **CI with a full-scope token** to run `supabase test db`-style assertions on
   every migration (stored token lacks the `workflows` scope — repo rule).

**Nothing here connects live.** No Supabase project, no keys, no network calls
were made while building this.
