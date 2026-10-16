-- Reverse Lab — row level security
-- Migration: 20261016000002_rls
-- Applies the Supabase RLS checklist (docs/architecture/execution-environments.md §6.1):
--   1. REVOKE default grants first (policies do NOT remove grants).
--   2. Explicit per-role grants after.
--   3. RLS enabled on EVERY table in the exposed schema.
--   4. One policy per operation; auth.uid() wrapped in a subselect.
--   5. service_role bypasses RLS — server-side orchestrator code is trusted code
--      and is the enforcement point for writes done via service_role.
--   6. No views in this migration (views default to security definer and would
--      bypass RLS if exposed through PostgREST).

-- ---------------------------------------------------------------------------
-- Owner-resolution helpers (SECURITY DEFINER so policies stay simple and do
-- not recurse through RLS-protected tables).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.research_projects p
    WHERE p.id = p_project_id
      AND p.owner_id = (select auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.investigation_project_id(p_run_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.project_id FROM public.investigation_runs r WHERE r.id = p_run_id;
$$;

-- ---------------------------------------------------------------------------
-- 1. Revoke the default grants Supabase hands to anon/authenticated on new
--    public tables. A policy alone does not remove these.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.research_projects   FROM anon, authenticated;
REVOKE ALL ON TABLE public.research_targets    FROM anon, authenticated;
REVOKE ALL ON TABLE public.research_questions  FROM anon, authenticated;
REVOKE ALL ON TABLE public.investigation_runs  FROM anon, authenticated;
REVOKE ALL ON TABLE public.investigation_steps FROM anon, authenticated;
REVOKE ALL ON TABLE public.evidence            FROM anon, authenticated;
REVOKE ALL ON TABLE public.findings            FROM anon, authenticated;
REVOKE ALL ON TABLE public.hypotheses          FROM anon, authenticated;
REVOKE ALL ON TABLE public.experiments         FROM anon, authenticated;
REVOKE ALL ON TABLE public.experiment_runs    FROM anon, authenticated;
REVOKE ALL ON TABLE public.artifacts           FROM anon, authenticated;
REVOKE ALL ON TABLE public.conclusions         FROM anon, authenticated;
REVOKE ALL ON TABLE public.usage_records       FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Explicit grants: the browser/edge app connects as `authenticated`.
--    anon gets nothing. service_role bypasses RLS by design (trusted server).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_projects   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_targets    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_questions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.investigation_runs  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.investigation_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.evidence            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.findings            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.hypotheses          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experiments         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.experiment_runs    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.artifacts           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.conclusions         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.usage_records       TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.investigation_project_id(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on EVERY table. A table without RLS in an exposed schema is
--    readable/writable by any role with a grant.
-- ---------------------------------------------------------------------------
ALTER TABLE public.research_projects   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_targets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_questions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hypotheses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiment_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conclusions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_records       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Policies. Owner-based throughout; every table resolves its owner through
--    the project chain. FOR UPDATE carries both USING and WITH CHECK so a row
--    cannot be moved into a project the caller does not own.
--    NOTE: auth.uid() is always wrapped as (select auth.uid()) — evaluated once
--    per query, not per row (Supabase documented performance pattern).
-- ---------------------------------------------------------------------------

-- research_projects: direct owner column
CREATE POLICY research_projects_select ON public.research_projects
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));
CREATE POLICY research_projects_insert ON public.research_projects
  FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY research_projects_update ON public.research_projects
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY research_projects_delete ON public.research_projects
  FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

-- research_targets: via project chain
CREATE POLICY research_targets_select ON public.research_targets
  FOR SELECT TO authenticated USING (public.is_project_owner(project_id));
CREATE POLICY research_targets_insert ON public.research_targets
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY research_targets_update ON public.research_targets
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY research_targets_delete ON public.research_targets
  FOR DELETE TO authenticated USING (public.is_project_owner(project_id));

-- research_questions: via project chain
CREATE POLICY research_questions_select ON public.research_questions
  FOR SELECT TO authenticated USING (public.is_project_owner(project_id));
CREATE POLICY research_questions_insert ON public.research_questions
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY research_questions_update ON public.research_questions
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY research_questions_delete ON public.research_questions
  FOR DELETE TO authenticated USING (public.is_project_owner(project_id));

-- investigation_runs: via project chain
CREATE POLICY investigation_runs_select ON public.investigation_runs
  FOR SELECT TO authenticated USING (public.is_project_owner(project_id));
CREATE POLICY investigation_runs_insert ON public.investigation_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY investigation_runs_update ON public.investigation_runs
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id))
  WITH CHECK (public.is_project_owner(project_id));
CREATE POLICY investigation_runs_delete ON public.investigation_runs
  FOR DELETE TO authenticated USING (public.is_project_owner(project_id));

-- investigation_steps: via run -> project
CREATE POLICY investigation_steps_select ON public.investigation_steps
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(run_id)));
CREATE POLICY investigation_steps_insert ON public.investigation_steps
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(run_id)));
CREATE POLICY investigation_steps_update ON public.investigation_steps
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(run_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(run_id)));
CREATE POLICY investigation_steps_delete ON public.investigation_steps
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(run_id)));

-- evidence: via investigation -> project
CREATE POLICY evidence_select ON public.evidence
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY evidence_insert ON public.evidence
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY evidence_update ON public.evidence
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(investigation_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY evidence_delete ON public.evidence
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));

-- findings: via investigation -> project
CREATE POLICY findings_select ON public.findings
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY findings_insert ON public.findings
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY findings_update ON public.findings
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(investigation_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY findings_delete ON public.findings
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));

-- hypotheses: via investigation -> project
CREATE POLICY hypotheses_select ON public.hypotheses
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY hypotheses_insert ON public.hypotheses
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY hypotheses_update ON public.hypotheses
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(investigation_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY hypotheses_delete ON public.hypotheses
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));

-- experiments: via investigation -> project
CREATE POLICY experiments_select ON public.experiments
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY experiments_insert ON public.experiments
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY experiments_update ON public.experiments
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(investigation_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY experiments_delete ON public.experiments
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));

-- experiment_runs: via experiment -> investigation -> project
CREATE POLICY experiment_runs_select ON public.experiment_runs
  FOR SELECT TO authenticated USING (
    public.is_project_owner(public.investigation_project_id(
      (SELECT e.investigation_id FROM public.experiments e WHERE e.id = experiment_runs.experiment_id)
    ))
  );
CREATE POLICY experiment_runs_insert ON public.experiment_runs
  FOR INSERT TO authenticated WITH CHECK (
    public.is_project_owner(public.investigation_project_id(
      (SELECT e.investigation_id FROM public.experiments e WHERE e.id = experiment_runs.experiment_id)
    ))
  );
CREATE POLICY experiment_runs_update ON public.experiment_runs
  FOR UPDATE TO authenticated
  USING (
    public.is_project_owner(public.investigation_project_id(
      (SELECT e.investigation_id FROM public.experiments e WHERE e.id = experiment_runs.experiment_id)
    ))
  )
  WITH CHECK (
    public.is_project_owner(public.investigation_project_id(
      (SELECT e.investigation_id FROM public.experiments e WHERE e.id = experiment_runs.experiment_id)
    ))
  );
CREATE POLICY experiment_runs_delete ON public.experiment_runs
  FOR DELETE TO authenticated USING (
    public.is_project_owner(public.investigation_project_id(
      (SELECT e.investigation_id FROM public.experiments e WHERE e.id = experiment_runs.experiment_id)
    ))
  );

-- artifacts: via investigation -> project
CREATE POLICY artifacts_select ON public.artifacts
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY artifacts_insert ON public.artifacts
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY artifacts_update ON public.artifacts
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(investigation_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY artifacts_delete ON public.artifacts
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));

-- conclusions: via investigation -> project
CREATE POLICY conclusions_select ON public.conclusions
  FOR SELECT TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY conclusions_insert ON public.conclusions
  FOR INSERT TO authenticated WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY conclusions_update ON public.conclusions
  FOR UPDATE TO authenticated
  USING (public.is_project_owner(public.investigation_project_id(investigation_id)))
  WITH CHECK (public.is_project_owner(public.investigation_project_id(investigation_id)));
CREATE POLICY conclusions_delete ON public.conclusions
  FOR DELETE TO authenticated USING (public.is_project_owner(public.investigation_project_id(investigation_id)));

-- usage_records: direct owner column (Phase 8 reserved; RLS now, logic later)
CREATE POLICY usage_records_select ON public.usage_records
  FOR SELECT TO authenticated USING (owner_id = (select auth.uid()));
CREATE POLICY usage_records_insert ON public.usage_records
  FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY usage_records_update ON public.usage_records
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));
CREATE POLICY usage_records_delete ON public.usage_records
  FOR DELETE TO authenticated USING (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Enforcement notes (kept with the schema so they are not lost):
-- * The server-side orchestrator uses service_role, which BYPASSES RLS.
--   Any code path using service_role is trusted code and must enforce
--   ownership in application logic.
-- * No views are created here. If analytics/summary views are added later,
--   they must be security_invoker (or not exposed via PostgREST), because
--   plain views bypass RLS with the view owner's rights.
-- * New tables added in later migrations MUST get ENABLE ROW LEVEL SECURITY
--   + revoke/explicit grants + policies, per the checklist above.
-- ---------------------------------------------------------------------------
