/**
 * Investigation orchestrator — the run lifecycle on the Store.
 *
 * - `startInvestigation(projectId, objective?)`: creates the run, plans with
 *   the deterministic planner, persists the steps, records the plan as
 *   evidence, and marks the run `running`.
 * - `advanceInvestigation(runId, { maxSteps })`: executes pending steps
 *   sequentially. A step failure is retried ONCE; after two failures the
 *   step is marked `failed` with the error text and the run goes `failed` —
 *   visible, never silent. When no pending steps remain the run completes.
 * - `revisePlan(runId)`: re-plans the REMAINING steps from the current
 *   evidence. Completed/failed steps are kept; evidence, hypotheses, and
 *   findings are never deleted.
 * - `continueInvestigation(runId, instruction)`: plans the instruction and
 *   appends its steps; prior findings and evidence are reused, hypotheses
 *   stay hypotheses.
 *
 * Step execution dispatch reads `capability=<id>` from the step detail
 * (written by the planner):
 * - rea-javascript-app / rea-sqlite: real REA CLI via the executor, mapped
 *   to lab Evidence, plus a reference Artifact for the target.
 * - rea-native: throws honestly — no native engine is installed
 *   (needs-configuration), so the step fails visibly instead of faking it.
 * - codegen-typescript: `generateAlternative` against the reference artifact.
 * - experiment-run: `runExperiment` for every spec of the run, then
 *   measurement evidence + conclusions from the raw comparison.
 * - internal steps (detail starts with `internal:`): evidence ingestion
 *   bookkeeping, hypothesis formation (recorded AS hypotheses),
 *   opportunity findings (provisional), experiment design, final summary.
 */

import { isAbsolute, join } from "node:path";
import { generateAlternative } from "../artifacts/codegen";
import { NotFoundError, type Store } from "../evidence/store";
import type { Executor } from "../execution/executor";
import {
  type BenchmarkHarnessScript,
  compareExperimentRuns,
  experimentSandbox,
  type MeasurementComparison,
  runExperiment,
} from "../experiments/runner";
import {
  analyzeJavascriptApplication,
  inspectSqliteDatabase,
  type ReaCliEvidence,
  reaEvidenceToLabEvidence,
} from "../reverse-engineering/rea";
import {
  type ExperimentSpec,
  generateId,
  type InvestigationRun,
  nowIso,
  type PlanStep,
} from "../types";
import { mechanismWord, planObjective } from "./planner";

export interface EngineDeps {
  store: Store;
  executor: Executor;
  /** Repo root: resolves relative target refs to absolute paths. */
  repoRoot: string;
  /** Writable lab data dir; sandbox/ and artifacts/ live underneath. */
  dataDir: string;
  /** Harness script for the experiment runner (argv-json protocol). */
  harnessScript: BenchmarkHarnessScript;
  /** Measurement names the harness emits (e.g. wall_time_ms, correctness). */
  measurements: string[];
  /** Absolute path to typescript/lib/tsc.js for codegen. */
  tscBin: string;
}

function getStore(deps: EngineDeps): Store {
  return deps.store;
}

async function getRunOrThrow(
  store: Store,
  runId: string,
): Promise<InvestigationRun> {
  const run = await store.getRun(runId);
  if (!run) {
    throw new NotFoundError("InvestigationRun", runId);
  }
  return run;
}

function capabilityOf(step: PlanStep): string | null {
  const match = /capability=([\w-]+)/.exec(step.detail ?? "");
  return match?.[1] ?? null;
}

function targetOf(step: PlanStep): string | null {
  const match = /target=([^;]+)/.exec(step.detail ?? "");
  return match?.[1]?.trim() ?? null;
}

/**
 * Create the run, plan the objective, persist the steps, and record the
 * plan itself as evidence (questions, expected evidence, criteria).
 */
export async function startInvestigation(
  deps: EngineDeps,
  projectId: string,
  objective?: string,
): Promise<InvestigationRun> {
  const store = getStore(deps);
  const project = await store.getProject(projectId);
  if (!project) {
    throw new NotFoundError("Project", projectId);
  }
  const finalObjective =
    objective?.trim() !== "" && objective !== undefined
      ? (objective as string).trim()
      : project.objective;
  const targets = await store.listTargets(projectId);
  const run = await store.createRun({
    projectId,
    objective: finalObjective,
  });
  const plan = planObjective(finalObjective, targets);
  for (const step of plan.steps) {
    await store.addStep(run.id, { title: step.title, detail: step.detail });
  }
  await store.addEvidence(run.id, {
    type: "investigation:plan",
    source: "reverse-lab planner (deterministic)",
    observation: JSON.stringify({
      objective: finalObjective,
      questions: plan.questions,
      expectedEvidence: plan.expectedEvidence,
      evaluationCriteria: plan.evaluationCriteria,
    }),
    limitations: plan.limitations,
    verification: "inferred",
    provenance: {
      planner: "deterministic-mvp",
      constraints: plan.constraints,
      stepCount: plan.steps.length,
    },
  });
  return store.updateRun(run.id, { status: "running", error: null });
}

/** Execute one step according to its capability (or internal handler). */
async function executeStep(
  deps: EngineDeps,
  run: InvestigationRun,
  step: PlanStep,
): Promise<void> {
  const capabilityId = capabilityOf(step);

  if (capabilityId === "rea-javascript-app" || capabilityId === "rea-sqlite") {
    await inspectWithRea(deps, run, step, capabilityId);
    return;
  }
  if (capabilityId === "rea-native") {
    throw new Error(
      "rea-native is needs-configuration: no native analysis engine is " +
        "installed on this host (see the capability's limitations). The " +
        "step cannot execute until an operator installs a supported engine.",
    );
  }
  if (capabilityId === "codegen-typescript") {
    await generateAlternativeStep(deps, run);
    return;
  }
  if (capabilityId === "experiment-run") {
    await runExperimentsStep(deps, run);
    return;
  }
  if (capabilityId !== null) {
    throw new Error(`unknown capability "${capabilityId}" in plan step`);
  }

  const title = step.title.toLowerCase();
  if (title.startsWith("ingest rea evidence")) {
    // Ingestion already happened inside each inspect step; this step is
    // bookkeeping so the plan reads as a complete pipeline.
    return;
  }
  if (title.startsWith("form hypotheses")) {
    await formHypotheses(deps, run);
    return;
  }
  if (title.startsWith("identify implementation opportunities")) {
    await identifyOpportunities(deps, run);
    return;
  }
  if (title.startsWith("design experiment")) {
    await designExperiment(deps, run);
    return;
  }
  if (title.startsWith("record findings and conclusions")) {
    await recordSummary(deps, run);
    return;
  }
  throw new Error(`no executor for plan step "${step.title}"`);
}

/** Run the real REA CLI, ingest the evidence, register a reference artifact. */
async function inspectWithRea(
  deps: EngineDeps,
  run: InvestigationRun,
  step: PlanStep,
  capabilityId: "rea-javascript-app" | "rea-sqlite",
): Promise<void> {
  const store = getStore(deps);
  const targetRef = targetOf(step);
  if (!targetRef) {
    throw new Error("inspect step has no target= in its detail");
  }
  const absTarget = isAbsolute(targetRef)
    ? targetRef
    : join(deps.repoRoot, targetRef);
  const env =
    process.env.REA_BIN !== undefined
      ? { REA_BIN: process.env.REA_BIN }
      : undefined;
  const reaOpts = { cwd: ".", timeoutMs: 300_000, env };

  let record: ReaCliEvidence;
  if (capabilityId === "rea-sqlite") {
    record = await inspectSqliteDatabase(deps.executor, absTarget, reaOpts);
  } else {
    record = await analyzeJavascriptApplication(
      deps.executor,
      absTarget,
      reaOpts,
    );
  }
  const labEvidence = reaEvidenceToLabEvidence(record);
  await store.addEvidence(run.id, { ...labEvidence, id: labEvidence.id });
  await store.addArtifact(run.id, {
    kind: "implementation",
    path: targetRef,
    description:
      `Reference target inspected with ${capabilityId} ` +
      `(${absTarget}); evidence ${labEvidence.id}`,
  });
}

/**
 * Record hypotheses AS hypotheses: proposed, citing evidence, never facts.
 * The statement is derived from the run objective — the evidence decides
 * whether it survives, via a later experiment.
 */
async function formHypotheses(
  deps: EngineDeps,
  run: InvestigationRun,
): Promise<void> {
  const store = getStore(deps);
  const evidence = await store.listEvidence(run.id);
  const mechanism = mechanismWord(run.objective);
  const statement =
    `Hypothesis (proposed, unverified): the ${mechanism} observed in this ` +
    `target can be reimplemented more simply without changing observable ` +
    `behavior. Status must be decided by experiment, not by assertion.`;
  await store.addHypothesis(run.id, {
    statement,
    evidenceIds: evidence.map((e) => e.id),
  });
}

/** Turn the hypothesis into a provisional opportunity finding. */
async function identifyOpportunities(
  deps: EngineDeps,
  run: InvestigationRun,
): Promise<void> {
  const store = getStore(deps);
  const evidence = await store.listEvidence(run.id);
  const hypotheses = await store.listHypotheses(run.id);
  const mechanism = mechanismWord(run.objective);
  const firstObservation =
    evidence[0]?.observation.slice(0, 400) ?? "(no evidence yet)";
  await store.addFinding(run.id, {
    title: `Opportunity: simpler ${mechanism} implementation`,
    body:
      `Provisional. The investigation hypothesizes (see hypothesis ` +
      `${hypotheses[0]?.id ?? "n/a"}) that the ${mechanism} can be ` +
      `reimplemented more simply. Grounding observation (evidence ` +
      `${evidence[0]?.id ?? "n/a"}): ${firstObservation}… ` +
      `Requires an experiment before any claim.`,
    evidenceIds: evidence.map((e) => e.id),
  });
}

/** Generate the alternative implementation against the reference artifact. */
async function generateAlternativeStep(
  deps: EngineDeps,
  run: InvestigationRun,
): Promise<void> {
  const store = getStore(deps);
  const artifacts = await store.listArtifacts(run.id);
  const reference = artifacts.find((a) => a.kind === "implementation");
  if (!reference) {
    throw new Error(
      "no reference implementation artifact registered — the inspect step " +
        "must complete before codegen",
    );
  }
  const hypotheses = await store.listHypotheses(run.id);
  await generateAlternative(
    {
      store,
      executor: deps.executor,
      artifactsRoot: join(deps.dataDir, "artifacts"),
      tscBin: deps.tscBin,
    },
    run.id,
    reference.id,
    run.objective,
    { hypothesisId: hypotheses[hypotheses.length - 1]?.id },
  );
}

/** Design the experiment spec: procedure, measurements, repetitions. */
async function designExperiment(
  deps: EngineDeps,
  run: InvestigationRun,
): Promise<void> {
  const store = getStore(deps);
  const artifacts = await store.listArtifacts(run.id);
  const reference = artifacts.find((a) => a.kind === "implementation");
  if (!reference) {
    throw new Error("cannot design an experiment without a reference artifact");
  }
  // The alternative is the codegen output — identified by its description
  // prefix (see generateAlternative). The inspect step also registers an
  // "implementation" artifact (the target directory, not runnable), which
  // must never be picked as the alternative.
  const alternatives = artifacts.filter(
    (a) =>
      a.kind === "implementation" &&
      a.id !== reference.id &&
      a.description.startsWith("Alternative implementation"),
  );
  const hypotheses = await store.listHypotheses(run.id);
  const hypothesis = hypotheses[hypotheses.length - 1];
  await store.createExperiment(run.id, {
    objective: `Compare reference vs alternative for: ${run.objective}`,
    ...(hypothesis ? { hypothesisId: hypothesis.id } : {}),
    reference: { artifactId: reference.id },
    ...(alternatives[0]
      ? { alternative: { artifactId: alternatives[0].id } }
      : {}),
    procedure: [
      "stage the reference and alternative artifacts in a fresh sandbox cwd",
      "run the benchmark harness against each artifact",
      `collect each measurement ${5} times per artifact`,
      "compare raw per-measurement stats (n, mean, min, max, delta vs reference)",
    ],
    measurements: [...deps.measurements],
    repetitions: 5,
    acceptance:
      "correctness == 1 on every repetition for both artifacts; the " +
      "alternative's wall_time_ms mean is reported as a raw delta — no " +
      "pass/fail is invented beyond the recorded numbers",
  });
}

/** Render a conclusion statement purely from the comparison numbers. */
function conclusionStatement(
  comparisons: MeasurementComparison[],
  failures: string[],
): string {
  const lines = comparisons.map((c) => {
    const ref = c.reference;
    const alt = c.alternative
      ? `alternative mean=${c.alternative.mean.toFixed(3)} (n=${c.alternative.n}, min=${c.alternative.min.toFixed(3)}, max=${c.alternative.max.toFixed(3)}), delta vs reference=${(c.deltaVsReference ?? 0).toFixed(3)}`
      : "no alternative ran";
    return (
      `${c.measurement}: reference mean=${ref.mean.toFixed(3)} ` +
      `(n=${ref.n}, min=${ref.min.toFixed(3)}, max=${ref.max.toFixed(3)}); ${alt}`
    );
  });
  if (failures.length > 0) {
    lines.push(`failures during the run: ${failures.join(" | ")}`);
  }
  lines.push(
    "Interpretation is left to the operator: these are raw measurements, " +
      "not a verdict. See the linked measurement evidence for the full " +
      "rawValues and environment.",
  );
  return lines.join("\n");
}

/** Execute every experiment spec of the run; record evidence + conclusions. */
async function runExperimentsStep(
  deps: EngineDeps,
  run: InvestigationRun,
): Promise<void> {
  const store = getStore(deps);
  const specs = await store.listExperiments(run.id);
  if (specs.length === 0) {
    throw new Error(
      "no experiment spec designed — the design step must run first",
    );
  }
  for (const spec of specs) {
    // The sandbox executor is rooted at <dataDir>/sandbox — never the
    // engine's executor (rooted at the repo root for REA/codegen).
    const { executor, sandboxRoot } = experimentSandbox(deps.dataDir);
    const expRun = await runExperiment(
      {
        store,
        executor,
        sandboxRoot,
        artifactPath: async (artifactId: string) => {
          const artifact = await store.getArtifact(artifactId);
          if (!artifact) {
            throw new NotFoundError("Artifact", artifactId);
          }
          return isAbsolute(artifact.path)
            ? artifact.path
            : join(deps.repoRoot, artifact.path);
        },
        harnessScript: deps.harnessScript,
      },
      spec.id,
    );
    const comparisons = compareExperimentRuns(spec, [expRun]);
    const evidence = await store.addEvidence(run.id, {
      type: "experiment:run",
      source: "reverse-lab experiment runner",
      observation: JSON.stringify({
        experimentId: spec.id,
        runId: expRun.id,
        comparisons,
      }),
      limitations: [
        "Wall-clock measurements on the lab host: noisy for micro-scale " +
          "workloads; repetitions and raw values are reported so anyone " +
          "can re-analyze.",
        "LocalExecutor isolation (sandbox directory + scrubbed env), not a " +
          "hardware-isolated microVM.",
      ],
      verification: "measured",
      provenance: {
        environment: expRun.environment,
        repetitions: spec.repetitions,
        failures: expRun.failures,
      },
    });
    await store.addConclusion(run.id, {
      statement: conclusionStatement(comparisons, expRun.failures),
      evidenceIds: [evidence.id],
      limitations: [
        "Raw measurements only — no verdict is derived from them here.",
        ...evidence.limitations,
      ],
    });
    if (expRun.status === "failed") {
      // The failure is recorded above (run record, evidence, conclusion);
      // the step still fails visibly so it is retried once, then fails the
      // run — a failed experiment is never converted into a success.
      throw new Error(
        `experiment ${spec.id} failed: ${expRun.failures.join(" | ")}`,
      );
    }
  }
}

/** Final summary finding: counts and pointers, all provisional. */
async function recordSummary(
  deps: EngineDeps,
  run: InvestigationRun,
): Promise<void> {
  const store = getStore(deps);
  const [evidence, hypotheses, findings, conclusions] = await Promise.all([
    store.listEvidence(run.id),
    store.listHypotheses(run.id),
    store.listFindings(run.id),
    store.listConclusions(run.id),
  ]);
  await store.addFinding(run.id, {
    title: `Investigation summary: ${run.objective}`,
    body:
      `Completed ${nowIso()}. Evidence records: ${evidence.length}. ` +
      `Hypotheses: ${hypotheses.length} ` +
      `(${hypotheses.map((h) => h.status).join(", ") || "none"}). ` +
      `Findings: ${findings.length}. Conclusions: ${conclusions.length}. ` +
      `Every conclusion links to measurement evidence; hypotheses remain ` +
      `hypotheses until an experiment changes their status.`,
    evidenceIds: evidence.map((e) => e.id),
  });
}

/**
 * Execute one step with a single retry. Returns false when the step (and
 * therefore the run) failed — the failure is recorded on the step detail
 * and on the run error, never swallowed.
 */
async function executeStepWithRetry(
  deps: EngineDeps,
  run: InvestigationRun,
  step: PlanStep,
): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await deps.store.updateStep(run.id, step.id, { status: "running" });
    try {
      await executeStep(deps, run, step);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const detail = `${step.detail ?? ""}\n[attempt ${attempt} failed] ${message}`;
      await deps.store.updateStep(run.id, step.id, {
        status: "failed",
        detail,
      });
      if (attempt === 2) {
        await deps.store.updateRun(run.id, {
          status: "failed",
          error: `step "${step.title}" failed after 2 attempts: ${message}`,
        });
        return false;
      }
      continue;
    }
    await deps.store.updateStep(run.id, step.id, { status: "completed" });
    return true;
  }
  return false;
}

/**
 * Execute pending steps sequentially (up to maxSteps). A step that fails
 * twice marks the run `failed` with the error visible; a run with no
 * pending steps left becomes `completed`.
 */
export async function advanceInvestigation(
  deps: EngineDeps,
  runId: string,
  opts?: { maxSteps?: number },
): Promise<InvestigationRun> {
  const store = getStore(deps);
  let run = await getRunOrThrow(store, runId);
  if (run.status === "completed") {
    return run;
  }
  if (run.status === "failed") {
    throw new Error(
      `investigation ${runId} is failed` +
        (run.error ? `: ${run.error}` : "") +
        " — revise the plan or continue with a new instruction",
    );
  }
  const maxSteps = opts?.maxSteps ?? Number.POSITIVE_INFINITY;
  let executed = 0;
  while (executed < maxSteps) {
    run = await getRunOrThrow(store, runId);
    const next = run.plan.find((s) => s.status === "pending");
    if (!next) {
      break;
    }
    await store.updateRun(run.id, { currentStep: next.id });
    const ok = await executeStepWithRetry(deps, run, next);
    executed += 1;
    if (!ok) {
      break;
    }
  }
  run = await getRunOrThrow(store, runId);
  if (
    run.status !== "failed" &&
    !run.plan.some((s) => s.status === "pending")
  ) {
    run = await store.updateRunStatus(run.id, "completed");
  }
  return run;
}

/**
 * Re-plan the REMAINING steps from the current evidence. Completed and
 * failed steps are kept verbatim; pending steps are replaced by the fresh
 * plan (deduplicated by title). Evidence, hypotheses, findings, and
 * conclusions are never touched.
 */
export async function revisePlan(
  deps: EngineDeps,
  runId: string,
): Promise<InvestigationRun> {
  const store = getStore(deps);
  const run = await getRunOrThrow(store, runId);
  const project = await store.getProject(run.projectId);
  const targets = project ? await store.listTargets(project.id) : [];
  const fresh = planObjective(run.objective, targets);

  const kept = run.plan.filter(
    (s) => s.status === "completed" || s.status === "failed",
  );
  const keptTitles = new Set(kept.map((s) => s.title));
  const plan: PlanStep[] = [...kept];
  for (const step of fresh.steps) {
    if (!keptTitles.has(step.title)) {
      plan.push({
        id: generateId(),
        title: step.title,
        status: "pending",
        detail: step.detail,
      });
    }
  }
  await store.updateRun(run.id, {
    plan,
    status: run.status === "failed" ? "running" : run.status,
    error: null,
  });
  await store.addEvidence(run.id, {
    type: "investigation:plan-revision",
    source: "reverse-lab planner (deterministic)",
    observation: JSON.stringify({
      keptSteps: kept.length,
      newSteps: plan.length - kept.length,
    }),
    limitations: [
      "Revision is deterministic: completed work is kept, pending work is " +
        "re-planned from the original objective, not reinterpreted.",
    ],
    verification: "inferred",
    provenance: { planner: "deterministic-mvp" },
  });
  return getRunOrThrow(store, runId);
}

/**
 * Continue the investigation with a new instruction: plan the instruction
 * and append its steps. Prior evidence, findings, and hypotheses are
 * reused as-is; hypotheses stay hypotheses.
 */
export async function continueInvestigation(
  deps: EngineDeps,
  runId: string,
  instruction: string,
): Promise<InvestigationRun> {
  if (instruction.trim() === "") {
    throw new Error("instruction is required");
  }
  const store = getStore(deps);
  const run = await getRunOrThrow(store, runId);
  const project = await store.getProject(run.projectId);
  const targets = project ? await store.listTargets(project.id) : [];
  const plan = planObjective(instruction, targets);
  for (const step of plan.steps) {
    await store.addStep(run.id, { title: step.title, detail: step.detail });
  }
  await store.updateRun(run.id, { status: "running", error: null });
  return getRunOrThrow(store, runId);
}
