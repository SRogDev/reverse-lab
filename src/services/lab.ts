/**
 * Application services — the single entry point for API routes and the demo.
 *
 * Services wrap the Store and the investigation orchestrator, validate
 * inputs at the boundary, and translate failures into `ServiceError`
 * (status + message) so routes stay thin. Business logic lives here or in
 * the engine, never in route handlers.
 *
 * `createServices(engine)` takes explicit EngineDeps (tests inject fakes);
 * `getServices()` builds the production deps from the environment:
 * FileStore singleton, LocalExecutor rooted at the repo, the KV benchmark
 * harness, and the repo's tsc. Set REA_BIN to a pre-installed `rea` binary
 * to skip the slow npx bootstrap for REA inspections.
 */

import { join } from "node:path";
import {
  type NewExperimentSpec,
  NotFoundError,
  type Store,
} from "../evidence/store.ts";
import { LocalExecutor } from "../execution/executor.ts";
import {
  KV_BENCHMARK_HARNESS,
  KV_MEASUREMENTS,
} from "../experiments/kv-harness.ts";
import {
  compareExperimentRuns,
  experimentSandbox,
  type MeasurementComparison,
  runExperiment,
} from "../experiments/runner.ts";
import {
  AIGatewayProvider,
  ScriptedModelProvider,
} from "../investigation-engine/model.ts";
import {
  advanceInvestigation,
  continueInvestigation,
  type EngineDeps,
  startInvestigation,
} from "../investigation-engine/orchestrator.ts";
import { getStore } from "../lib/store.ts";
import type {
  Artifact,
  Conclusion,
  Evidence,
  ExperimentRun,
  ExperimentSpec,
  Finding,
  Hypothesis,
  InvestigationRun,
  Project,
  ResearchTarget,
  ResearchTargetKind,
} from "../types";

/** Thrown for expected failures; routes map `status` to the HTTP code. */
export class ServiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
  }
}

const TARGET_KINDS: ResearchTargetKind[] = [
  "repo",
  "component",
  "feature",
  "product",
  "docs",
  "article",
  "benchmark",
  "experiment",
];

function badRequest(message: string): ServiceError {
  return new ServiceError(400, message);
}

function notFound(entity: string, id: string): ServiceError {
  return new ServiceError(404, `${entity} not found: ${id}`);
}

/** Map store/orchestrator NotFoundError to a 404 ServiceError. */
async function catchingNotFound<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new ServiceError(404, err.message);
    }
    throw err;
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export interface CreateProjectInput {
  name: string;
  objective: string;
  constraints?: string[];
}

export interface AddTargetInput {
  kind: string;
  ref: string;
}

export interface ProjectDetails {
  project: Project;
  targets: ResearchTarget[];
  runs: InvestigationRun[];
}

export interface InvestigationResults {
  run: InvestigationRun;
  findings: Finding[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  conclusions: Conclusion[];
  experiments: ExperimentSpec[];
}

export interface ExperimentResults {
  spec: ExperimentSpec;
  runs: ExperimentRun[];
  comparisons: MeasurementComparison[];
}

export interface Services {
  createProject(input: CreateProjectInput): Promise<Project>;
  listProjects(): Promise<Project[]>;
  getProjectDetails(id: string): Promise<ProjectDetails>;
  addTarget(projectId: string, input: AddTargetInput): Promise<ResearchTarget>;
  startInvestigation(
    projectId: string,
    objective?: string,
  ): Promise<InvestigationRun>;
  getInvestigationStatus(id: string): Promise<InvestigationRun>;
  getInvestigationResults(id: string): Promise<InvestigationResults>;
  listFindings(investigationId: string): Promise<Finding[]>;
  createExperiment(
    investigationId: string,
    spec: Omit<NewExperimentSpec, "hypothesisId"> & { hypothesisId?: string },
  ): Promise<ExperimentSpec>;
  getExperimentResults(experimentId: string): Promise<ExperimentResults>;
  runExperiment(experimentId: string): Promise<ExperimentRun>;
  continueInvestigation(
    runId: string,
    instruction: string,
  ): Promise<InvestigationRun>;
  advanceInvestigation(
    runId: string,
    opts?: { maxSteps?: number },
  ): Promise<InvestigationRun>;
  listArtifacts(investigationId: string): Promise<Artifact[]>;
}

export function createServices(engine: EngineDeps): Services {
  const store: Store = engine.store;

  return {
    async createProject(input) {
      if (!nonEmpty(input.name)) {
        throw badRequest("name is required");
      }
      if (!nonEmpty(input.objective)) {
        throw badRequest("objective is required");
      }
      const constraints = Array.isArray(input.constraints)
        ? input.constraints.filter((c): c is string => typeof c === "string")
        : [];
      return store.createProject({
        name: input.name.trim(),
        objective: input.objective.trim(),
        constraints,
      });
    },

    async listProjects() {
      return store.listProjects();
    },

    async getProjectDetails(id) {
      const project = await store.getProject(id);
      if (!project) {
        throw notFound("project", id);
      }
      const [targets, runs] = await Promise.all([
        store.listTargets(id),
        store.listRuns(id),
      ]);
      return { project, targets, runs };
    },

    async addTarget(projectId, input) {
      const project = await store.getProject(projectId);
      if (!project) {
        throw notFound("project", projectId);
      }
      if (!TARGET_KINDS.includes(input.kind as ResearchTargetKind)) {
        throw badRequest(`kind must be one of: ${TARGET_KINDS.join(", ")}`);
      }
      if (!nonEmpty(input.ref)) {
        throw badRequest("ref is required");
      }
      return store.createTarget({
        projectId,
        kind: input.kind as ResearchTargetKind,
        ref: input.ref.trim(),
      });
    },

    async startInvestigation(projectId, objective) {
      return catchingNotFound(() =>
        startInvestigation(engine, projectId, objective),
      );
    },

    async getInvestigationStatus(id) {
      const run = await store.getRun(id);
      if (!run) {
        throw notFound("investigation", id);
      }
      return run;
    },

    async getInvestigationResults(id) {
      const run = await store.getRun(id);
      if (!run) {
        throw notFound("investigation", id);
      }
      const [findings, evidence, hypotheses, conclusions, experiments] =
        await Promise.all([
          store.listFindings(id),
          store.listEvidence(id),
          store.listHypotheses(id),
          store.listConclusions(id),
          store.listExperiments(id),
        ]);
      return { run, findings, evidence, hypotheses, conclusions, experiments };
    },

    async listFindings(investigationId) {
      return store.listFindings(investigationId);
    },

    async createExperiment(investigationId, spec) {
      const run = await store.getRun(investigationId);
      if (!run) {
        throw notFound("investigation", investigationId);
      }
      if (!nonEmpty(spec.objective)) {
        throw badRequest("spec.objective is required");
      }
      if (
        !spec.reference ||
        typeof spec.reference.artifactId !== "string" ||
        spec.reference.artifactId.trim() === ""
      ) {
        throw badRequest("spec.reference.artifactId is required");
      }
      if (!Array.isArray(spec.procedure) || spec.procedure.length === 0) {
        throw badRequest("spec.procedure must be a non-empty array");
      }
      if (!Array.isArray(spec.measurements) || spec.measurements.length === 0) {
        throw badRequest("spec.measurements must be a non-empty array");
      }
      if (
        typeof spec.repetitions !== "number" ||
        !Number.isInteger(spec.repetitions) ||
        spec.repetitions < 1
      ) {
        throw badRequest("spec.repetitions must be a positive integer");
      }
      if (!nonEmpty(spec.acceptance)) {
        throw badRequest("spec.acceptance is required");
      }
      return store.createExperiment(investigationId, {
        objective: spec.objective.trim(),
        ...(nonEmpty(spec.hypothesisId)
          ? { hypothesisId: (spec.hypothesisId as string).trim() }
          : {}),
        reference: { artifactId: spec.reference.artifactId },
        ...(spec.alternative &&
        typeof spec.alternative.artifactId === "string" &&
        spec.alternative.artifactId.trim() !== ""
          ? { alternative: { artifactId: spec.alternative.artifactId } }
          : {}),
        procedure: spec.procedure.filter(
          (p): p is string => typeof p === "string",
        ),
        measurements: spec.measurements.filter(
          (m): m is string => typeof m === "string",
        ),
        repetitions: spec.repetitions,
        acceptance: spec.acceptance.trim(),
      });
    },

    async getExperimentResults(experimentId) {
      const spec = await store.getExperiment(experimentId);
      if (!spec) {
        throw notFound("experiment", experimentId);
      }
      const runs = await store.listExperimentRuns(experimentId);
      return { spec, runs, comparisons: compareExperimentRuns(spec, runs) };
    },

    async runExperiment(experimentId) {
      const spec = await store.getExperiment(experimentId);
      if (!spec) {
        throw notFound("experiment", experimentId);
      }
      // The runner needs an executor rooted at <dataDir>/sandbox; the
      // engine's executor is rooted at the repo root (for REA/codegen).
      const { executor, sandboxRoot } = experimentSandbox(engine.dataDir);
      return runExperiment(
        {
          store,
          executor,
          sandboxRoot,
          artifactPath: async (artifactId: string) => {
            const artifact = await store.getArtifact(artifactId);
            if (!artifact) {
              throw notFound("artifact", artifactId);
            }
            return artifact.path;
          },
          harnessScript: engine.harnessScript,
        },
        experimentId,
      );
    },

    async continueInvestigation(runId, instruction) {
      if (!nonEmpty(instruction)) {
        throw badRequest("instruction is required");
      }
      return catchingNotFound(() =>
        continueInvestigation(engine, runId, instruction.trim()),
      );
    },

    async advanceInvestigation(runId, opts) {
      try {
        return await catchingNotFound(() =>
          advanceInvestigation(engine, runId, opts),
        );
      } catch (err) {
        if (
          err instanceof Error &&
          /is failed.*revise the plan/i.test(err.message)
        ) {
          throw new ServiceError(409, err.message);
        }
        throw err;
      }
    },

    async listArtifacts(investigationId) {
      return store.listArtifacts(investigationId);
    },
  };
}

/** Production services from the environment (routes and demo use this). */
export function getServices(): Services {
  const repoRoot = process.cwd();
  const engine: EngineDeps = {
    store: getStore(),
    executor: new LocalExecutor({ sandboxRoot: repoRoot }),
    repoRoot,
    dataDir: process.env.REVERSE_LAB_DATA_DIR ?? join(repoRoot, "data"),
    harnessScript: KV_BENCHMARK_HARNESS,
    measurements: [...KV_MEASUREMENTS],
    tscBin: join(repoRoot, "node_modules", "typescript", "lib", "tsc.js"),
    // The model provider for LLM codegen: the real AI Gateway provider
    // when its key is configured, the deterministic scripted provider
    // otherwise — in which case the planner keeps the template transform
    // and records the synthesis limitation (canSynthesize gate).
    modelProvider: process.env.AI_GATEWAY_API_KEY
      ? new AIGatewayProvider()
      : new ScriptedModelProvider({}),
  };
  return createServices(engine);
}
