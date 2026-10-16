/**
 * Evidence store — persistence for projects, targets, investigation runs,
 * evidence, findings, hypotheses, experiments, artifacts, and conclusions.
 *
 * Two implementations share the `Store` interface:
 * - `FileStore`: JSON files under a data directory (gitignored), atomic
 *   writes (tmp + rename). Works today with zero keys — the Phase 1 default.
 * - `SupabaseStore`: honest stub. Every method throws until SUPABASE_URL and
 *   SUPABASE_SERVICE_KEY are configured; the real implementation (with the
 *   schema in supabase/migrations/) lands when Roger provides the project.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Artifact,
  type ArtifactKind,
  type Conclusion,
  type Evidence,
  type ExperimentRun,
  type ExperimentSpec,
  type Finding,
  type FindingStatus,
  generateId,
  type Hypothesis,
  type HypothesisStatus,
  type InvestigationRun,
  labEvidenceId,
  nowIso,
  type PlanStep,
  type Project,
  type ResearchTarget,
  type ResearchTargetKind,
  type RunStatus,
} from "../types";

/** Input for evidence the lab itself generates (id is content-addressed). */
export type NewEvidence = Omit<Evidence, "id" | "createdAt"> & { id?: string };

/** Input for a new experiment spec (id/investigationId assigned by store). */
export type NewExperimentSpec = Omit<ExperimentSpec, "id" | "investigationId">;

export interface Store {
  // projects
  createProject(input: {
    name: string;
    objective: string;
    constraints?: string[];
  }): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;

  // targets
  createTarget(input: {
    projectId: string;
    kind: ResearchTargetKind;
    ref: string;
  }): Promise<ResearchTarget>;
  listTargets(projectId: string): Promise<ResearchTarget[]>;

  // investigation runs
  createRun(input: {
    projectId: string;
    objective: string;
  }): Promise<InvestigationRun>;
  getRun(id: string): Promise<InvestigationRun | null>;
  listRuns(projectId: string): Promise<InvestigationRun[]>;
  updateRunStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<InvestigationRun>;
  updateRun(
    id: string,
    patch: {
      status?: RunStatus;
      currentStep?: string;
      error?: string | null;
      plan?: PlanStep[];
    },
  ): Promise<InvestigationRun>;
  addStep(
    runId: string,
    input: { title: string; detail?: string },
  ): Promise<PlanStep>;
  updateStep(
    runId: string,
    stepId: string,
    patch: { status?: RunStatus; title?: string; detail?: string },
  ): Promise<PlanStep>;

  // evidence
  addEvidence(investigationId: string, input: NewEvidence): Promise<Evidence>;
  listEvidence(investigationId: string): Promise<Evidence[]>;

  // findings
  addFinding(
    investigationId: string,
    input: { title: string; body: string; evidenceIds: string[] },
  ): Promise<Finding>;
  listFindings(investigationId: string): Promise<Finding[]>;
  updateFindingStatus(id: string, status: FindingStatus): Promise<Finding>;

  // hypotheses
  addHypothesis(
    investigationId: string,
    input: { statement: string; evidenceIds?: string[] },
  ): Promise<Hypothesis>;
  listHypotheses(investigationId: string): Promise<Hypothesis[]>;
  updateHypothesis(
    id: string,
    patch: { status?: HypothesisStatus; evidenceIds?: string[] },
  ): Promise<Hypothesis>;

  // experiments
  createExperiment(
    investigationId: string,
    input: NewExperimentSpec,
  ): Promise<ExperimentSpec>;
  getExperiment(id: string): Promise<ExperimentSpec | null>;
  listExperiments(investigationId: string): Promise<ExperimentSpec[]>;
  addExperimentRun(
    experimentId: string,
    input: {
      environment?: Record<string, unknown>;
      notes?: string;
    },
  ): Promise<ExperimentRun>;
  updateExperimentRun(
    id: string,
    patch: {
      status?: RunStatus;
      finishedAt?: string;
      environment?: Record<string, unknown>;
      rawValues?: Record<string, number[]>;
      failures?: string[];
      notes?: string;
    },
  ): Promise<ExperimentRun>;

  // artifacts & conclusions
  addArtifact(
    investigationId: string,
    input: { kind: ArtifactKind; path: string; description: string },
  ): Promise<Artifact>;
  addConclusion(
    investigationId: string,
    input: { statement: string; evidenceIds: string[]; limitations: string[] },
  ): Promise<Conclusion>;
  listConclusions(investigationId: string): Promise<Conclusion[]>;
}

/** Thrown when a mutation targets a record that does not exist. */
export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "NotFoundError";
  }
}

/** Evidence as stored: the lab contract plus the investigation link. */
type StoredEvidence = Evidence & { investigationId: string };

function stripInvestigationLink(stored: StoredEvidence): Evidence {
  const { investigationId: _investigationId, ...evidence } = stored;
  return evidence;
}

/** Deterministic canonical JSON for content-addressed lab evidence ids. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * JSON-file store. One file per entity under `dataDir`; every mutation
 * rewrites its file atomically (write tmp + rename), so a crash can never
 * leave a half-written file behind. Reads are whole-file; fine for PoC
 * scale, not a substitute for the Supabase implementation at product scale.
 */
export class FileStore implements Store {
  private readonly dataDir: string;

  constructor(opts?: { dataDir?: string }) {
    this.dataDir = opts?.dataDir ?? join(process.cwd(), "data");
  }

  private path(name: string): string {
    return join(this.dataDir, `${name}.json`);
  }

  private async load<T>(name: string): Promise<T[]> {
    try {
      const raw = await readFile(this.path(name), "utf8");
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  private async save<T>(name: string, rows: T[]): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const target = this.path(name);
    const tmp = `${target}.tmp.${process.pid}`;
    await writeFile(tmp, JSON.stringify(rows, null, 2), "utf8");
    await rename(tmp, target);
  }

  // -- projects ---------------------------------------------------------

  async createProject(input: {
    name: string;
    objective: string;
    constraints?: string[];
  }): Promise<Project> {
    const now = nowIso();
    const project: Project = {
      id: generateId(),
      name: input.name,
      objective: input.objective,
      constraints: input.constraints ?? [],
      createdAt: now,
      updatedAt: now,
    };
    const rows = await this.load<Project>("projects");
    rows.push(project);
    await this.save("projects", rows);
    return project;
  }

  async getProject(id: string): Promise<Project | null> {
    const rows = await this.load<Project>("projects");
    return rows.find((p) => p.id === id) ?? null;
  }

  async listProjects(): Promise<Project[]> {
    return this.load<Project>("projects");
  }

  // -- targets ----------------------------------------------------------

  async createTarget(input: {
    projectId: string;
    kind: ResearchTargetKind;
    ref: string;
  }): Promise<ResearchTarget> {
    const target: ResearchTarget = {
      id: generateId(),
      projectId: input.projectId,
      kind: input.kind,
      ref: input.ref,
      createdAt: nowIso(),
    };
    const rows = await this.load<ResearchTarget>("targets");
    rows.push(target);
    await this.save("targets", rows);
    return target;
  }

  async listTargets(projectId: string): Promise<ResearchTarget[]> {
    const rows = await this.load<ResearchTarget>("targets");
    return rows.filter((t) => t.projectId === projectId);
  }

  // -- investigation runs -----------------------------------------------

  async createRun(input: {
    projectId: string;
    objective: string;
  }): Promise<InvestigationRun> {
    const now = nowIso();
    const run: InvestigationRun = {
      id: generateId(),
      projectId: input.projectId,
      objective: input.objective,
      status: "pending",
      plan: [],
      createdAt: now,
      updatedAt: now,
    };
    const rows = await this.load<InvestigationRun>("runs");
    rows.push(run);
    await this.save("runs", rows);
    return run;
  }

  async getRun(id: string): Promise<InvestigationRun | null> {
    const rows = await this.load<InvestigationRun>("runs");
    return rows.find((r) => r.id === id) ?? null;
  }

  async listRuns(projectId: string): Promise<InvestigationRun[]> {
    const rows = await this.load<InvestigationRun>("runs");
    return rows.filter((r) => r.projectId === projectId);
  }

  private async mutateRun(
    id: string,
    mutate: (run: InvestigationRun) => void,
  ): Promise<InvestigationRun> {
    const rows = await this.load<InvestigationRun>("runs");
    const run = rows.find((r) => r.id === id);
    if (!run) {
      throw new NotFoundError("InvestigationRun", id);
    }
    mutate(run);
    run.updatedAt = nowIso();
    await this.save("runs", rows);
    return run;
  }

  async updateRunStatus(
    id: string,
    status: RunStatus,
    error?: string,
  ): Promise<InvestigationRun> {
    return this.mutateRun(id, (run) => {
      run.status = status;
      if (error !== undefined) {
        run.error = error;
      }
    });
  }

  async updateRun(
    id: string,
    patch: {
      status?: RunStatus;
      currentStep?: string;
      error?: string | null;
      plan?: PlanStep[];
    },
  ): Promise<InvestigationRun> {
    return this.mutateRun(id, (run) => {
      if (patch.status !== undefined) {
        run.status = patch.status;
      }
      if (patch.currentStep !== undefined) {
        run.currentStep = patch.currentStep;
      }
      if (patch.error !== undefined) {
        if (patch.error === null) {
          delete run.error;
        } else {
          run.error = patch.error;
        }
      }
      if (patch.plan !== undefined) {
        run.plan = patch.plan;
      }
    });
  }

  async addStep(
    runId: string,
    input: { title: string; detail?: string },
  ): Promise<PlanStep> {
    const step: PlanStep = {
      id: generateId(),
      title: input.title,
      status: "pending",
      ...(input.detail !== undefined ? { detail: input.detail } : {}),
    };
    await this.mutateRun(runId, (run) => {
      run.plan.push(step);
    });
    return step;
  }

  async updateStep(
    runId: string,
    stepId: string,
    patch: { status?: RunStatus; title?: string; detail?: string },
  ): Promise<PlanStep> {
    let updated: PlanStep | undefined;
    await this.mutateRun(runId, (run) => {
      const step = run.plan.find((s) => s.id === stepId);
      if (!step) {
        throw new NotFoundError("PlanStep", stepId);
      }
      if (patch.status !== undefined) {
        step.status = patch.status;
      }
      if (patch.title !== undefined) {
        step.title = patch.title;
      }
      if (patch.detail !== undefined) {
        step.detail = patch.detail;
      }
      updated = step;
    });
    if (!updated) {
      throw new NotFoundError("PlanStep", stepId);
    }
    return updated;
  }

  // -- evidence ----------------------------------------------------------

  async addEvidence(
    investigationId: string,
    input: NewEvidence,
  ): Promise<Evidence> {
    const id =
      input.id ??
      labEvidenceId(
        canonicalize({
          type: input.type,
          source: input.source,
          sourceUrl: input.sourceUrl,
          observation: input.observation,
          limitations: input.limitations,
          verification: input.verification,
          provenance: input.provenance,
        }),
      );
    const rows = await this.load<StoredEvidence>("evidence");
    const existing = rows.find(
      (e) => e.id === id && e.investigationId === investigationId,
    );
    if (existing) {
      return stripInvestigationLink(existing);
    }
    const stored: StoredEvidence = {
      id,
      type: input.type,
      source: input.source,
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl } : {}),
      observation: input.observation,
      limitations: input.limitations,
      verification: input.verification,
      provenance: input.provenance,
      createdAt: nowIso(),
      investigationId,
    };
    rows.push(stored);
    await this.save("evidence", rows);
    return stripInvestigationLink(stored);
  }

  async listEvidence(investigationId: string): Promise<Evidence[]> {
    const rows = await this.load<StoredEvidence>("evidence");
    return rows
      .filter((e) => e.investigationId === investigationId)
      .map(stripInvestigationLink);
  }

  // -- findings ----------------------------------------------------------

  async addFinding(
    investigationId: string,
    input: { title: string; body: string; evidenceIds: string[] },
  ): Promise<Finding> {
    const finding: Finding = {
      id: generateId(),
      investigationId,
      title: input.title,
      body: input.body,
      evidenceIds: input.evidenceIds,
      status: "provisional",
    };
    const rows = await this.load<Finding>("findings");
    rows.push(finding);
    await this.save("findings", rows);
    return finding;
  }

  async listFindings(investigationId: string): Promise<Finding[]> {
    const rows = await this.load<Finding>("findings");
    return rows.filter((f) => f.investigationId === investigationId);
  }

  async updateFindingStatus(
    id: string,
    status: FindingStatus,
  ): Promise<Finding> {
    const rows = await this.load<Finding>("findings");
    const finding = rows.find((f) => f.id === id);
    if (!finding) {
      throw new NotFoundError("Finding", id);
    }
    finding.status = status;
    await this.save("findings", rows);
    return finding;
  }

  // -- hypotheses --------------------------------------------------------

  async addHypothesis(
    investigationId: string,
    input: { statement: string; evidenceIds?: string[] },
  ): Promise<Hypothesis> {
    const hypothesis: Hypothesis = {
      id: generateId(),
      investigationId,
      statement: input.statement,
      status: "proposed",
      evidenceIds: input.evidenceIds ?? [],
    };
    const rows = await this.load<Hypothesis>("hypotheses");
    rows.push(hypothesis);
    await this.save("hypotheses", rows);
    return hypothesis;
  }

  async listHypotheses(investigationId: string): Promise<Hypothesis[]> {
    const rows = await this.load<Hypothesis>("hypotheses");
    return rows.filter((h) => h.investigationId === investigationId);
  }

  async updateHypothesis(
    id: string,
    patch: { status?: HypothesisStatus; evidenceIds?: string[] },
  ): Promise<Hypothesis> {
    const rows = await this.load<Hypothesis>("hypotheses");
    const hypothesis = rows.find((h) => h.id === id);
    if (!hypothesis) {
      throw new NotFoundError("Hypothesis", id);
    }
    if (patch.status !== undefined) {
      hypothesis.status = patch.status;
    }
    if (patch.evidenceIds !== undefined) {
      hypothesis.evidenceIds = patch.evidenceIds;
    }
    await this.save("hypotheses", rows);
    return hypothesis;
  }

  // -- experiments -------------------------------------------------------

  async createExperiment(
    investigationId: string,
    input: NewExperimentSpec,
  ): Promise<ExperimentSpec> {
    const spec: ExperimentSpec = {
      id: generateId(),
      investigationId,
      objective: input.objective,
      ...(input.hypothesisId !== undefined
        ? { hypothesisId: input.hypothesisId }
        : {}),
      reference: input.reference,
      ...(input.alternative !== undefined
        ? { alternative: input.alternative }
        : {}),
      procedure: input.procedure,
      measurements: input.measurements,
      repetitions: input.repetitions,
      acceptance: input.acceptance,
    };
    const rows = await this.load<ExperimentSpec>("experiments");
    rows.push(spec);
    await this.save("experiments", rows);
    return spec;
  }

  async getExperiment(id: string): Promise<ExperimentSpec | null> {
    const rows = await this.load<ExperimentSpec>("experiments");
    return rows.find((e) => e.id === id) ?? null;
  }

  async listExperiments(investigationId: string): Promise<ExperimentSpec[]> {
    const rows = await this.load<ExperimentSpec>("experiments");
    return rows.filter((e) => e.investigationId === investigationId);
  }

  async addExperimentRun(
    experimentId: string,
    input: {
      environment?: Record<string, unknown>;
      notes?: string;
    },
  ): Promise<ExperimentRun> {
    const run: ExperimentRun = {
      id: generateId(),
      experimentId,
      status: "pending",
      startedAt: nowIso(),
      environment: input.environment ?? {},
      rawValues: {},
      failures: [],
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    const rows = await this.load<ExperimentRun>("experiment-runs");
    rows.push(run);
    await this.save("experiment-runs", rows);
    return run;
  }

  async updateExperimentRun(
    id: string,
    patch: {
      status?: RunStatus;
      finishedAt?: string;
      environment?: Record<string, unknown>;
      rawValues?: Record<string, number[]>;
      failures?: string[];
      notes?: string;
    },
  ): Promise<ExperimentRun> {
    const rows = await this.load<ExperimentRun>("experiment-runs");
    const run = rows.find((r) => r.id === id);
    if (!run) {
      throw new NotFoundError("ExperimentRun", id);
    }
    if (patch.status !== undefined) {
      run.status = patch.status;
    }
    if (patch.finishedAt !== undefined) {
      run.finishedAt = patch.finishedAt;
    }
    if (patch.environment !== undefined) {
      run.environment = patch.environment;
    }
    if (patch.rawValues !== undefined) {
      run.rawValues = patch.rawValues;
    }
    if (patch.failures !== undefined) {
      run.failures = patch.failures;
    }
    if (patch.notes !== undefined) {
      run.notes = patch.notes;
    }
    await this.save("experiment-runs", rows);
    return run;
  }

  // -- artifacts & conclusions --------------------------------------------

  async addArtifact(
    investigationId: string,
    input: { kind: ArtifactKind; path: string; description: string },
  ): Promise<Artifact> {
    const artifact: Artifact = {
      id: generateId(),
      investigationId,
      kind: input.kind,
      path: input.path,
      description: input.description,
      createdAt: nowIso(),
    };
    const rows = await this.load<Artifact>("artifacts");
    rows.push(artifact);
    await this.save("artifacts", rows);
    return artifact;
  }

  async addConclusion(
    investigationId: string,
    input: { statement: string; evidenceIds: string[]; limitations: string[] },
  ): Promise<Conclusion> {
    const conclusion: Conclusion = {
      id: generateId(),
      investigationId,
      statement: input.statement,
      evidenceIds: input.evidenceIds,
      limitations: input.limitations,
    };
    const rows = await this.load<Conclusion>("conclusions");
    rows.push(conclusion);
    await this.save("conclusions", rows);
    return conclusion;
  }

  async listConclusions(investigationId: string): Promise<Conclusion[]> {
    const rows = await this.load<Conclusion>("conclusions");
    return rows.filter((c) => c.investigationId === investigationId);
  }
}

const SUPABASE_NOT_CONFIGURED =
  "Supabase not configured — set SUPABASE_URL and SUPABASE_SERVICE_KEY; " +
  "schema in supabase/migrations/";

function notConfigured(): never {
  throw new Error(SUPABASE_NOT_CONFIGURED);
}

/**
 * Honest stub for the Supabase-backed store. Every method throws until the
 * project is configured — it never pretends to persist. The real
 * implementation lands when Roger provides SUPABASE_URL and
 * SUPABASE_SERVICE_KEY (schema: supabase/migrations/).
 */
export class SupabaseStore implements Store {
  async createProject(_input: {
    name: string;
    objective: string;
    constraints?: string[];
  }): Promise<Project> {
    return notConfigured();
  }

  async getProject(_id: string): Promise<Project | null> {
    return notConfigured();
  }

  async listProjects(): Promise<Project[]> {
    return notConfigured();
  }

  async createTarget(_input: {
    projectId: string;
    kind: ResearchTargetKind;
    ref: string;
  }): Promise<ResearchTarget> {
    return notConfigured();
  }

  async listTargets(_projectId: string): Promise<ResearchTarget[]> {
    return notConfigured();
  }

  async createRun(_input: {
    projectId: string;
    objective: string;
  }): Promise<InvestigationRun> {
    return notConfigured();
  }

  async getRun(_id: string): Promise<InvestigationRun | null> {
    return notConfigured();
  }

  async listRuns(_projectId: string): Promise<InvestigationRun[]> {
    return notConfigured();
  }

  async updateRunStatus(
    _id: string,
    _status: RunStatus,
    _error?: string,
  ): Promise<InvestigationRun> {
    return notConfigured();
  }

  async updateRun(
    _id: string,
    _patch: {
      status?: RunStatus;
      currentStep?: string;
      error?: string | null;
      plan?: PlanStep[];
    },
  ): Promise<InvestigationRun> {
    return notConfigured();
  }

  async addStep(
    _runId: string,
    _input: { title: string; detail?: string },
  ): Promise<PlanStep> {
    return notConfigured();
  }

  async updateStep(
    _runId: string,
    _stepId: string,
    _patch: { status?: RunStatus; title?: string; detail?: string },
  ): Promise<PlanStep> {
    return notConfigured();
  }

  async addEvidence(
    _investigationId: string,
    _input: NewEvidence,
  ): Promise<Evidence> {
    return notConfigured();
  }

  async listEvidence(_investigationId: string): Promise<Evidence[]> {
    return notConfigured();
  }

  async addFinding(
    _investigationId: string,
    _input: { title: string; body: string; evidenceIds: string[] },
  ): Promise<Finding> {
    return notConfigured();
  }

  async listFindings(_investigationId: string): Promise<Finding[]> {
    return notConfigured();
  }

  async updateFindingStatus(
    _id: string,
    _status: FindingStatus,
  ): Promise<Finding> {
    return notConfigured();
  }

  async addHypothesis(
    _investigationId: string,
    _input: { statement: string; evidenceIds?: string[] },
  ): Promise<Hypothesis> {
    return notConfigured();
  }

  async listHypotheses(_investigationId: string): Promise<Hypothesis[]> {
    return notConfigured();
  }

  async updateHypothesis(
    _id: string,
    _patch: { status?: HypothesisStatus; evidenceIds?: string[] },
  ): Promise<Hypothesis> {
    return notConfigured();
  }

  async createExperiment(
    _investigationId: string,
    _input: NewExperimentSpec,
  ): Promise<ExperimentSpec> {
    return notConfigured();
  }

  async getExperiment(_id: string): Promise<ExperimentSpec | null> {
    return notConfigured();
  }

  async listExperiments(_investigationId: string): Promise<ExperimentSpec[]> {
    return notConfigured();
  }

  async addExperimentRun(
    _experimentId: string,
    _input: {
      environment?: Record<string, unknown>;
      notes?: string;
    },
  ): Promise<ExperimentRun> {
    return notConfigured();
  }

  async updateExperimentRun(
    _id: string,
    _patch: {
      status?: RunStatus;
      finishedAt?: string;
      environment?: Record<string, unknown>;
      rawValues?: Record<string, number[]>;
      failures?: string[];
      notes?: string;
    },
  ): Promise<ExperimentRun> {
    return notConfigured();
  }

  async addArtifact(
    _investigationId: string,
    _input: { kind: ArtifactKind; path: string; description: string },
  ): Promise<Artifact> {
    return notConfigured();
  }

  async addConclusion(
    _investigationId: string,
    _input: { statement: string; evidenceIds: string[]; limitations: string[] },
  ): Promise<Conclusion> {
    return notConfigured();
  }

  async listConclusions(_investigationId: string): Promise<Conclusion[]> {
    return notConfigured();
  }
}
