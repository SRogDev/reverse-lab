-- Reverse Lab — DEMO seed data
-- File: supabase/seed.sql
--
-- !!! DEMO DATA ONLY — not a real investigation !!!
-- One fictional project ("demo-mini-kv") exercising the full chain:
--   project → target → run → evidence (observed + inferred) → finding
--   → hypothesis → experiment → experiment_run.
-- The numbers in raw_values are ILLUSTRATIVE, not measured.
--
-- Apply (dev only): psql "$DATABASE_URL" -f supabase/seed.sql
-- or: supabase db reset (applies migrations + this seed to the local DB).
--
-- Safe to delete: everything belongs to the single DEMO project below.
-- Idempotent: safe to re-run; rows are keyed by fixed UUIDs / evidence ids.

BEGIN;

-- ---------------------------------------------------------------------------
-- Demo owner + project (fixed UUIDs so the seed is re-runnable)
-- ---------------------------------------------------------------------------
INSERT INTO public.research_projects (id, owner_id, name, objective, constraints)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'demo-mini-kv',
  'DEMO objective: reverse-engineer the write path of a fictional key-value store and rebuild a faster alternative.',
  ARRAY['DEMO DATA — not a real investigation', 'numbers are illustrative, not measured']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  objective = EXCLUDED.objective,
  constraints = EXCLUDED.constraints,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Demo target
-- ---------------------------------------------------------------------------
INSERT INTO public.research_targets (id, project_id, kind, ref)
VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'repo',
  'https://github.com/example/mini-kv (DEMO — fictional target)'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo investigation run (completed)
-- ---------------------------------------------------------------------------
INSERT INTO public.investigation_runs (id, project_id, objective, status, plan, current_step)
VALUES (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'DEMO: understand mini-kv write batching and design a faster alternative.',
  'completed',
  '["clone target", "analyze write path", "design experiment", "run benchmark", "compare results"]'::jsonb,
  'compare results'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  plan = EXCLUDED.plan,
  current_step = EXCLUDED.current_step,
  updated_at = now();

INSERT INTO public.investigation_steps (id, run_id, title, status, detail, started_at, finished_at)
VALUES (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'DEMO: analyze write path',
  'completed',
  'Static walkthrough of the fictional write path. DEMO only.',
  now() - interval '2 hours',
  now() - interval '1 hour'
)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Demo evidence: one OBSERVED row, one INFERRED row — the distinction the
-- architecture requires (observed behavior vs inferred internals).
-- ---------------------------------------------------------------------------
INSERT INTO public.evidence
  (id, investigation_id, type, source, source_url, observation, producer, raw,
   limitations, verification, coverage, provenance, supersedes)
VALUES (
  'ev_5e6b9a810f69137a1c954786c3707532700c661f5fcda8d16ec0f9effc8727bc',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'demo.code_walkthrough',
  'DEMO: static walkthrough of fictional write path',
  NULL,
  'The write path batches fsync calls: one fsync per N queued writes (N=10 in the fictional source).',
  '{"producer": "lab-seed", "tool": "seed.sql", "demo": true}'::jsonb,
  '{"write_path": {"fsync_batch_size": 10, "loop": "for (const w of queue) { ... }; fsync();"}}'::jsonb,
  ARRAY['DEMO only: covers the fictional code path, not a real system', 'not load-tested'],
  'observed',
  '{"facets": {"write-path": "available", "read-path": "unavailable: not examined (DEMO)"}}'::jsonb,
  '{"tool": "seed.sql", "ingested_by": "supabase/seed.sql", "demo": true}'::jsonb,
  '{}'
)
ON CONFLICT (id) DO UPDATE SET
  observation = EXCLUDED.observation,
  limitations = EXCLUDED.limitations,
  verification = EXCLUDED.verification,
  coverage = EXCLUDED.coverage,
  provenance = EXCLUDED.provenance;

INSERT INTO public.evidence
  (id, investigation_id, type, source, source_url, observation, producer, raw,
   limitations, verification, coverage, provenance, supersedes)
VALUES (
  'lab-ev_6a6beb67234ad03b36cdfd2530165110da36906d96be0cb2c177d6fa8d9177e5',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'demo.inference',
  'DEMO: inference from the observed batching pattern',
  NULL,
  'The batch interval likely adapts to write throughput — an inference from the fixed N=10 constant, not a measured fact.',
  '{"producer": "lab-seed", "tool": "seed.sql", "demo": true}'::jsonb,
  NULL,
  ARRAY['INFERENCE ONLY — contradicts nothing, but proves nothing', 'must be tested before becoming a finding'],
  'inferred',
  '{"facets": {"batch-interval-adaptation": "unavailable: no data (DEMO)"}}'::jsonb,
  '{"tool": "seed.sql", "ingested_by": "supabase/seed.sql", "derived_from": "ev_5e6b9a810f69137a1c954786c3707532700c661f5fcda8d16ec0f9effc8727bc", "demo": true}'::jsonb,
  '{}'
)
ON CONFLICT (id) DO UPDATE SET
  observation = EXCLUDED.observation,
  limitations = EXCLUDED.limitations,
  verification = EXCLUDED.verification,
  coverage = EXCLUDED.coverage,
  provenance = EXCLUDED.provenance;

-- ---------------------------------------------------------------------------
-- Demo finding linked to the observed evidence
-- ---------------------------------------------------------------------------
INSERT INTO public.findings (id, investigation_id, title, body, evidence_ids, status)
VALUES (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'DEMO: write batching is the main throughput lever',
  'The fictional write path amortizes fsync cost across N=10 writes. Batch size is the dominant parameter for write throughput in this fictional design.',
  ARRAY['ev_5e6b9a810f69137a1c954786c3707532700c661f5fcda8d16ec0f9effc8727bc'],
  'provisional'
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  evidence_ids = EXCLUDED.evidence_ids,
  status = EXCLUDED.status;

-- ---------------------------------------------------------------------------
-- Demo hypothesis + experiment + experiment run
-- ---------------------------------------------------------------------------
INSERT INTO public.hypotheses (id, investigation_id, statement, status, evidence_ids)
VALUES (
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'DEMO hypothesis: raising the fsync batch interval from 10 to 100 ops improves write throughput in the fictional mini-kv without exceeding its documented durability bounds.',
  'supported',
  ARRAY['ev_5e6b9a810f69137a1c954786c3707532700c661f5fcda8d16ec0f9effc8727bc']
)
ON CONFLICT (id) DO UPDATE SET
  statement = EXCLUDED.statement,
  status = EXCLUDED.status,
  evidence_ids = EXCLUDED.evidence_ids;

INSERT INTO public.experiments (id, investigation_id, objective, hypothesis_id, spec)
VALUES (
  '99999999-9999-4999-8999-999999999999',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'DEMO: measure write throughput at fsync batch intervals 10 vs 100.',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '{"design": "A/B benchmark on the fictional write path", "repetitions": 5, "metric": "ops/sec", "variants": {"control": {"batch_interval": 10}, "treatment": {"batch_interval": 100}}, "environment_note": "DEMO — values illustrative, not measured"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  objective = EXCLUDED.objective,
  hypothesis_id = EXCLUDED.hypothesis_id,
  spec = EXCLUDED.spec;

INSERT INTO public.experiment_runs (id, experiment_id, status, started_at, finished_at, environment, raw_values, failures, notes)
VALUES (
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999',
  'completed',
  now() - interval '1 hour',
  now() - interval '30 minutes',
  '{"note": "DEMO — illustrative only, not a real measurement", "os": "fictional", "runner": "seed.sql"}'::jsonb,
  '{"batch_10_ops_per_sec": [1200, 1210, 1195, 1205, 1198], "batch_100_ops_per_sec": [4100, 4080, 4150, 4090, 4120], "DEMO_WARNING": "illustrative numbers, NOT measured"}'::jsonb,
  '{}',
  'DEMO run: numbers are illustrative placeholders, not real measurements. A real run would carry environment, inputs, repetitions, and raw data per the architecture invariant.'
)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  environment = EXCLUDED.environment,
  raw_values = EXCLUDED.raw_values,
  failures = EXCLUDED.failures,
  notes = EXCLUDED.notes;

COMMIT;
