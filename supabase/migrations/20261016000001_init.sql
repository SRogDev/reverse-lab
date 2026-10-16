-- Reverse Lab — initial schema
-- Migration: 20261016000001_init
-- Purpose: core tables for projects, investigations, evidence, experiments.
-- No live connections. Supabase/Postgres 15+ (tested against PG 16).

-- gen_random_uuid() is core in PG 13+, but Supabase projects commonly rely on
-- pgcrypto; keep the extension declaration for parity with Supabase defaults.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Domains (shared CHECK sets; one definition, reused everywhere)
-- ---------------------------------------------------------------------------
CREATE DOMAIN run_status AS text
  CHECK (VALUE IN ('pending','running','completed','failed','blocked','needs-evaluation','provisional'));

CREATE DOMAIN target_kind AS text
  CHECK (VALUE IN ('repo','component','feature','product','docs','article','benchmark','experiment'));

CREATE DOMAIN evidence_verification AS text
  CHECK (VALUE IN ('observed','source-fact','third-party','measured','hypothesis','inferred'));

CREATE DOMAIN finding_status AS text
  CHECK (VALUE IN ('provisional','confirmed','refuted'));

CREATE DOMAIN hypothesis_status AS text
  CHECK (VALUE IN ('proposed','testing','supported','refuted'));

CREATE DOMAIN artifact_kind AS text
  CHECK (VALUE IN ('implementation','report','test-result'));

-- ---------------------------------------------------------------------------
-- Helper: keep updated_at honest
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- research_projects — top of the ownership chain; everything else resolves its
-- owner through project_id (directly or via investigation_runs).
-- ---------------------------------------------------------------------------
CREATE TABLE public.research_projects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL,                -- auth.users.id in Supabase
  name        text,
  objective   text        NOT NULL,
  constraints text[]      NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_research_projects_owner_id ON public.research_projects (owner_id);
CREATE TRIGGER trg_research_projects_updated_at
  BEFORE UPDATE ON public.research_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.research_projects IS
  'Research project. owner_id is the RLS anchor: all child rows resolve their owner through the project chain.';

-- ---------------------------------------------------------------------------
-- research_targets — software targets under investigation
-- ---------------------------------------------------------------------------
CREATE TABLE public.research_targets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES public.research_projects (id) ON DELETE CASCADE,
  kind       target_kind NOT NULL,
  ref        text        NOT NULL,   -- repo URL, path, DOI, product name, ...
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_research_targets_project_id ON public.research_targets (project_id);

-- ---------------------------------------------------------------------------
-- research_questions — open questions driving an investigation
-- ---------------------------------------------------------------------------
CREATE TABLE public.research_questions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid        NOT NULL REFERENCES public.research_projects (id) ON DELETE CASCADE,
  question   text        NOT NULL,
  status     text        NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_research_questions_project_id ON public.research_questions (project_id);

-- ---------------------------------------------------------------------------
-- investigation_runs — a persistent autonomous investigation (plan/execute/revise)
-- ---------------------------------------------------------------------------
CREATE TABLE public.investigation_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid        NOT NULL REFERENCES public.research_projects (id) ON DELETE CASCADE,
  objective    text        NOT NULL,
  status       run_status  NOT NULL DEFAULT 'pending',
  plan         jsonb       NOT NULL DEFAULT '[]',   -- ordered plan steps
  current_step text,
  error        text,                                 -- last failure, stays visible
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_investigation_runs_project_id ON public.investigation_runs (project_id);
CREATE TRIGGER trg_investigation_runs_updated_at
  BEFORE UPDATE ON public.investigation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- investigation_steps — plan steps of a run
-- ---------------------------------------------------------------------------
CREATE TABLE public.investigation_steps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid        NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  title       text        NOT NULL,
  status      run_status  NOT NULL DEFAULT 'pending',
  detail      text,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_investigation_steps_run_id ON public.investigation_steps (run_id);

-- ---------------------------------------------------------------------------
-- evidence — structured evidence records. id is TEXT and content-addressed
-- (ev_<sha256> / lab-ev_<sha256>, matching REA's evidence_id format) so
-- identical observations deduplicate for free. Carries every field from the
-- REA→lab mapping (docs/research/rea-integration.md §3): id, producer,
-- claim/observation, raw, limitations[], coverage, provenance, supersedes.
-- ---------------------------------------------------------------------------
CREATE TABLE public.evidence (
  id              text                  PRIMARY KEY
                    CHECK (id ~ '^ev_[0-9a-f]{64}$' OR id ~ '^lab-ev_[0-9a-f]{64}$'),
  investigation_id uuid                 NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  type            text                  NOT NULL,   -- e.g. 'rea.tool_result', 'measurement', 'doc_quote'
  source          text                  NOT NULL,   -- human-readable source label
  source_url      text,
  observation     text                  NOT NULL,   -- the claim / normalized result
  producer        jsonb                 NOT NULL DEFAULT '{}',  -- provider {id,name,version} + analysis_profile digest
  raw             jsonb,                                      -- provider-native result (nullable)
  limitations     text[]                NOT NULL DEFAULT '{}', -- honesty guarantees, stored verbatim
  verification    evidence_verification NOT NULL,              -- observed vs inferred live here
  coverage        jsonb                 NOT NULL DEFAULT '{}', -- relationship_coverage + facet_availability
  provenance      jsonb                 NOT NULL DEFAULT '{}', -- tool name + input args (reproducibility)
  supersedes      text[]                NOT NULL DEFAULT '{}', -- ids this record revises
  created_at      timestamptz           NOT NULL DEFAULT now()
);
CREATE INDEX idx_evidence_investigation_id ON public.evidence (investigation_id);
CREATE INDEX idx_evidence_verification ON public.evidence (verification);

COMMENT ON COLUMN public.evidence.id IS
  'Content-addressed id (ev_<sha256> / lab-ev_<sha256>). Same observation ⇒ same id ⇒ dedup for free.';
COMMENT ON COLUMN public.evidence.verification IS
  'Observed behavior and inferred internals are stored separately (architecture invariant).';
COMMENT ON COLUMN public.evidence.limitations IS
  'Honesty guarantees from the producer, stored verbatim and surfaced next to every claim.';

-- ---------------------------------------------------------------------------
-- findings — structured findings linked to evidence
-- ---------------------------------------------------------------------------
CREATE TABLE public.findings (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid           NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  title            text,
  body             text,
  evidence_ids     text[]         NOT NULL DEFAULT '{}',
  status           finding_status NOT NULL DEFAULT 'provisional',
  created_at       timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX idx_findings_investigation_id ON public.findings (investigation_id);

-- ---------------------------------------------------------------------------
-- hypotheses — testable statements, linked to evidence
-- ---------------------------------------------------------------------------
CREATE TABLE public.hypotheses (
  id               uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid              NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  statement        text              NOT NULL,
  status           hypothesis_status NOT NULL DEFAULT 'proposed',
  evidence_ids     text[]            NOT NULL DEFAULT '{}',
  created_at       timestamptz       NOT NULL DEFAULT now()
);
CREATE INDEX idx_hypotheses_investigation_id ON public.hypotheses (investigation_id);

-- ---------------------------------------------------------------------------
-- experiments — experiment specs (design), optionally testing a hypothesis
-- ---------------------------------------------------------------------------
CREATE TABLE public.experiments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid        NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  objective        text        NOT NULL,
  hypothesis_id    uuid        REFERENCES public.hypotheses (id) ON DELETE SET NULL,
  spec             jsonb       NOT NULL,   -- design: method, inputs, repetitions, metrics, environment plan
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_experiments_investigation_id ON public.experiments (investigation_id);
CREATE INDEX idx_experiments_hypothesis_id ON public.experiments (hypothesis_id);

-- ---------------------------------------------------------------------------
-- experiment_runs — executions of an experiment spec; failed runs stay visible
-- ---------------------------------------------------------------------------
CREATE TABLE public.experiment_runs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid        NOT NULL REFERENCES public.experiments (id) ON DELETE CASCADE,
  status        run_status  NOT NULL DEFAULT 'pending',
  started_at    timestamptz,
  finished_at   timestamptz,
  environment   jsonb       NOT NULL DEFAULT '{}',   -- execution context (required by architecture invariant)
  raw_values    jsonb       NOT NULL DEFAULT '{}',   -- measured values, never summarized-only
  failures      text[]      NOT NULL DEFAULT '{}',   -- failure details stay visible
  notes         text
);
CREATE INDEX idx_experiment_runs_experiment_id ON public.experiment_runs (experiment_id);

-- ---------------------------------------------------------------------------
-- artifacts — durable outputs: implementations, reports, test results
-- ---------------------------------------------------------------------------
CREATE TABLE public.artifacts (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid          NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  kind             artifact_kind NOT NULL,
  path             text          NOT NULL,   -- storage path / repo path of the artifact
  description      text,
  created_at       timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX idx_artifacts_investigation_id ON public.artifacts (investigation_id);

-- ---------------------------------------------------------------------------
-- conclusions — investigation conclusions, traceable to evidence
-- ---------------------------------------------------------------------------
CREATE TABLE public.conclusions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id uuid        NOT NULL REFERENCES public.investigation_runs (id) ON DELETE CASCADE,
  statement        text        NOT NULL,
  evidence_ids     text[]      NOT NULL DEFAULT '{}',
  limitations      text[]      NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conclusions_investigation_id ON public.conclusions (investigation_id);

-- ---------------------------------------------------------------------------
-- usage_records — TABLE ONLY for future Phase 8 (billing / Research Credits).
-- No application logic reads or writes it in the MVP. Documented, inert.
-- ---------------------------------------------------------------------------
CREATE TABLE public.usage_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid,
  investigation_id uuid        REFERENCES public.investigation_runs (id) ON DELETE SET NULL,
  kind             text,
  quantity         numeric,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_records_owner_id ON public.usage_records (owner_id);
CREATE INDEX idx_usage_records_investigation_id ON public.usage_records (investigation_id);

COMMENT ON TABLE public.usage_records IS
  'RESERVED for Phase 8 (billing/Research Credits). Inert in the MVP: no application logic reads or writes this table.';
