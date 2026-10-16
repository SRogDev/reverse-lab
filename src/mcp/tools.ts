/**
 * MCP tool definitions for Reverse Lab.
 *
 * Thin-adapter rule: every tool calls the same `Store` interface the Next.js
 * API routes use (`src/evidence/store.ts`). Tools are deliberately one-shot
 * calls — no session state lives here; the `Store` is the shared state.
 *
 * Evidence honesty: every claim-bearing output includes `evidence_ids` and
 * `limitations` next to the claim. Findings also carry their evidence's
 * limitations, resolved at read time from the store.
 *
 * REWIRE NOTE: `start_investigation` and `continue_investigation` currently
 * operate at the Store level (create runs, record steps). When the Phase 3
 * investigation engine lands in `src/services/`, these two tools delegate to
 * it instead — the store-level paths stay as the honest fallback and are
 * marked `// REWIRE` below.
 */

import { z } from "zod";
import type { Store } from "../evidence/store";

/** Error that becomes an MCP `isError` tool result (4xx-style). */
export class ToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  objective: z.string(),
  constraints: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const planStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  detail: z.string().optional(),
});

const runSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  objective: z.string(),
  status: z.string(),
  plan: z.array(planStepSchema),
  currentStep: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
});

const evidenceSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.string(),
  sourceUrl: z.string().optional(),
  observation: z.string(),
  limitations: z.array(z.string()),
  verification: z.string(),
  createdAt: z.string(),
});

const findingSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  /** Evidence ids backing the claim — never a bare assertion. */
  evidence_ids: z.array(z.string()),
  /** Limitations inherited from the linked evidence. */
  limitations: z.array(z.string()),
});

const hypothesisSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  statement: z.string(),
  status: z.string(),
  evidence_ids: z.array(z.string()),
  limitations: z.array(z.string()),
});

const conclusionSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  statement: z.string(),
  evidence_ids: z.array(z.string()),
  limitations: z.array(z.string()),
});

const experimentSchema = z.object({
  id: z.string(),
  investigationId: z.string(),
  objective: z.string(),
  hypothesisId: z.string().optional(),
  procedure: z.array(z.string()),
  measurements: z.array(z.string()),
  repetitions: z.number(),
  acceptance: z.string(),
});

const experimentRunSchema = z.object({
  id: z.string(),
  experimentId: z.string(),
  status: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  environment: z.record(z.string(), z.unknown()),
  rawValues: z.record(z.string(), z.array(z.number())),
  failures: z.array(z.string()),
  notes: z.string().optional(),
});

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  execute: (store: Store, args: unknown) => Promise<unknown>;
}

/**
 * Resolve limitations for a list of evidence ids, read from the store.
 * Unknown ids are reported honestly instead of silently dropped.
 */
async function resolveLimitations(
  store: Store,
  investigationId: string,
  evidenceIds: string[],
): Promise<{ limitations: string[] }> {
  const all = await store.listEvidence(investigationId);
  const byId = new Map(all.map((e) => [e.id, e]));
  const limitations: string[] = [];
  const missing: string[] = [];
  for (const id of evidenceIds) {
    const evidence = byId.get(id);
    if (!evidence) {
      missing.push(id);
      continue;
    }
    limitations.push(...evidence.limitations);
  }
  for (const id of missing) {
    limitations.push(`evidence record not found: ${id}`);
  }
  if (evidenceIds.length === 0) {
    limitations.push("no evidence linked — treat the claim as provisional");
  }
  return { limitations: [...new Set(limitations)] };
}

async function requireRun(store: Store, investigationId: string) {
  const run = await store.getRun(investigationId);
  if (!run) {
    throw new ToolError("not_found", `investigation not found: ${investigationId}`);
  }
  return run;
}

const createResearchProject: ToolDefinition = {
  name: "create_research_project",
  description:
    "Create a research project: a named engineering objective with optional constraints.",
  inputSchema: z.object({
    name: z.string().min(1),
    objective: z.string().min(1),
    constraints: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({ project: projectSchema }),
  execute: async (store, args) => {
    const input = createResearchProject.inputSchema.parse(args) as {
      name: string;
      objective: string;
      constraints?: string[];
    };
    const project = await store.createProject({
      name: input.name,
      objective: input.objective,
      constraints: input.constraints,
    });
    return { project };
  },
};

const startInvestigation: ToolDefinition = {
  name: "start_investigation",
  description:
    "Start an investigation run under a project. Creates the run record; " +
    "autonomous execution begins when the Phase 3 engine lands (run stays pending).",
  inputSchema: z.object({
    projectId: z.string().min(1),
    objective: z.string().min(1).optional(),
  }),
  outputSchema: z.object({ run: runSchema }),
  execute: async (store, args) => {
    const input = startInvestigation.inputSchema.parse(args) as {
      projectId: string;
      objective?: string;
    };
    const project = await store.getProject(input.projectId);
    if (!project) {
      throw new ToolError("not_found", `project not found: ${input.projectId}`);
    }
    // Mirrors POST /api/investigations.
    // REWIRE: delegate to src/services when the Phase 3 engine lands —
    // the engine will draft the plan and drive steps from here.
    const objective =
      typeof input.objective === "string" && input.objective.trim() !== ""
        ? input.objective.trim()
        : project.objective;
    const run = await store.createRun({ projectId: project.id, objective });
    return { run };
  },
};

const getInvestigationStatus: ToolDefinition = {
  name: "get_investigation_status",
  description:
    "Get the current status, current step, and plan of an investigation run.",
  inputSchema: z.object({ investigationId: z.string().min(1) }),
  outputSchema: z.object({ run: runSchema }),
  execute: async (store, args) => {
    const input = getInvestigationStatus.inputSchema.parse(args) as {
      investigationId: string;
    };
    const run = await requireRun(store, input.investigationId);
    return { run };
  },
};

const getInvestigationResults: ToolDefinition = {
  name: "get_investigation_results",
  description:
    "Get the full results of an investigation: findings, evidence, " +
    "hypotheses, and conclusions. Every claim carries evidence_ids and limitations.",
  inputSchema: z.object({ investigationId: z.string().min(1) }),
  outputSchema: z.object({
    run: z.object({
      id: z.string(),
      objective: z.string(),
      status: z.string(),
    }),
    findings: z.array(findingSchema),
    evidence: z.array(evidenceSchema),
    hypotheses: z.array(hypothesisSchema),
    conclusions: z.array(conclusionSchema),
  }),
  execute: async (store, args) => {
    const input = getInvestigationResults.inputSchema.parse(args) as {
      investigationId: string;
    };
    const run = await requireRun(store, input.investigationId);
    const [rawFindings, evidence, rawHypotheses, rawConclusions] =
      await Promise.all([
        store.listFindings(run.id),
        store.listEvidence(run.id),
        store.listHypotheses(run.id),
        store.listConclusions(run.id),
      ]);
    const findings = await Promise.all(
      rawFindings.map(async (f) => {
        const { limitations } = await resolveLimitations(
          store,
          run.id,
          f.evidenceIds,
        );
        return {
          id: f.id,
          investigationId: f.investigationId,
          title: f.title,
          body: f.body,
          status: f.status,
          evidence_ids: f.evidenceIds,
          limitations,
        };
      }),
    );
    const hypotheses = await Promise.all(
      rawHypotheses.map(async (h) => {
        const { limitations } = await resolveLimitations(
          store,
          run.id,
          h.evidenceIds,
        );
        return {
          id: h.id,
          investigationId: h.investigationId,
          statement: h.statement,
          status: h.status,
          evidence_ids: h.evidenceIds,
          limitations,
        };
      }),
    );
    const conclusions = rawConclusions.map((c) => ({
      id: c.id,
      investigationId: c.investigationId,
      statement: c.statement,
      evidence_ids: c.evidenceIds,
      limitations: c.limitations,
    }));
    return {
      run: { id: run.id, objective: run.objective, status: run.status },
      findings,
      evidence: evidence.map((e) => ({
        id: e.id,
        type: e.type,
        source: e.source,
        ...(e.sourceUrl !== undefined ? { sourceUrl: e.sourceUrl } : {}),
        observation: e.observation,
        limitations: e.limitations,
        verification: e.verification,
        createdAt: e.createdAt,
      })),
      hypotheses,
      conclusions,
    };
  },
};

const listResearchFindings: ToolDefinition = {
  name: "list_research_findings",
  description:
    "List the findings of an investigation, optionally filtered by status. " +
    "Each finding carries evidence_ids and limitations.",
  inputSchema: z.object({
    investigationId: z.string().min(1),
    status: z.enum(["provisional", "confirmed", "refuted"]).optional(),
  }),
  outputSchema: z.object({ findings: z.array(findingSchema) }),
  execute: async (store, args) => {
    const input = listResearchFindings.inputSchema.parse(args) as {
      investigationId: string;
      status?: "provisional" | "confirmed" | "refuted";
    };
    const run = await requireRun(store, input.investigationId);
    const rawFindings = await store.listFindings(run.id);
    const filtered =
      input.status !== undefined
        ? rawFindings.filter((f) => f.status === input.status)
        : rawFindings;
    const findings = await Promise.all(
      filtered.map(async (f) => {
        const { limitations } = await resolveLimitations(
          store,
          run.id,
          f.evidenceIds,
        );
        return {
          id: f.id,
          investigationId: f.investigationId,
          title: f.title,
          body: f.body,
          status: f.status,
          evidence_ids: f.evidenceIds,
          limitations,
        };
      }),
    );
    return { findings };
  },
};

const getExperimentResults: ToolDefinition = {
  name: "get_experiment_results",
  description:
    "Get an experiment spec and all its recorded runs (measured values, " +
    "failures, environments).",
  inputSchema: z.object({ experimentId: z.string().min(1) }),
  outputSchema: z.object({
    experiment: experimentSchema,
    runs: z.array(experimentRunSchema),
  }),
  execute: async (store, args) => {
    const input = getExperimentResults.inputSchema.parse(args) as {
      experimentId: string;
    };
    const experiment = await store.getExperiment(input.experimentId);
    if (!experiment) {
      throw new ToolError(
        "not_found",
        `experiment not found: ${input.experimentId}`,
      );
    }
    // Thin adapter over the Store — same interface the API routes use.
    const runs = await store.listExperimentRuns(experiment.id);
    return {
      experiment: {
        id: experiment.id,
        investigationId: experiment.investigationId,
        objective: experiment.objective,
        ...(experiment.hypothesisId !== undefined
          ? { hypothesisId: experiment.hypothesisId }
          : {}),
        procedure: experiment.procedure,
        measurements: experiment.measurements,
        repetitions: experiment.repetitions,
        acceptance: experiment.acceptance,
      },
      runs: runs.map((r) => ({
        id: r.id,
        experimentId: r.experimentId,
        status: r.status,
        startedAt: r.startedAt,
        ...(r.finishedAt !== undefined ? { finishedAt: r.finishedAt } : {}),
        environment: r.environment,
        rawValues: r.rawValues,
        failures: r.failures,
        ...(r.notes !== undefined ? { notes: r.notes } : {}),
      })),
    };
  },
};

const continueInvestigation: ToolDefinition = {
  name: "continue_investigation",
  description:
    "Append a steering instruction to an investigation as a pending plan step " +
    "and mark the run running. Autonomous execution of the step begins when " +
    "the Phase 3 engine lands.",
  inputSchema: z.object({
    investigationId: z.string().min(1),
    instruction: z.string().min(1),
  }),
  outputSchema: z.object({ run: runSchema }),
  execute: async (store, args) => {
    const input = continueInvestigation.inputSchema.parse(args) as {
      investigationId: string;
      instruction: string;
    };
    const run = await requireRun(store, input.investigationId);
    // Store-level version only: record the instruction; the engine executes it.
    // REWIRE: delegate to src/services when the Phase 3 engine lands.
    await store.addStep(run.id, {
      title: input.instruction,
      detail:
        "Recorded via continue_investigation (MCP). Autonomous execution " +
        "awaits the Phase 3 investigation engine; the step stays pending until then.",
    });
    const updated = await store.updateRunStatus(run.id, "running");
    return { run: updated };
  },
};

export const toolDefinitions: ToolDefinition[] = [
  createResearchProject,
  startInvestigation,
  getInvestigationStatus,
  getInvestigationResults,
  listResearchFindings,
  getExperimentResults,
  continueInvestigation,
];
