#!/usr/bin/env tsx
/**
 * npm run lab:investigate -- --objective "..." --target samples/mini-kv
 *
 * REAL end-to-end investigation, zero keys:
 *  1. create project + target (kind: repo)
 *  2. register a runnable reference artifact (the target's compiled JS)
 *  3. plan with the deterministic planner
 *  4. REA probe via the real CLI (REA_BIN or npx fallback) -> evidence in
 *  5. hypotheses (recorded as hypotheses) -> opportunities -> experiment design
 *  6. generateAlternative: deterministic TS variant, tsc --strict in the executor
 *  7. runExperiment: real harness, spec.measurements x repetitions, full context
 *  8. compare raw stats -> measurement evidence + conclusions
 *  9. print the summary (evidence ids, real numbers, limitations)
 *
 * Exits 0 when the investigation completes; exits 1 with the visible error
 * when anything fails (failures are never converted into successes).
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { FileStore } from "../evidence/store";
import { LocalExecutor } from "../execution/executor";
import {
  KV_BENCHMARK_HARNESS,
  KV_MEASUREMENTS,
} from "../experiments/kv-harness";
import {
  compareExperimentRuns,
  type MeasurementComparison,
} from "../experiments/runner";
import { createServices } from "../services/lab";
import { explainLimitations } from "../learning/explain";
import type { EngineDeps } from "../investigation-engine/orchestrator";
import type { Hypothesis } from "../types";

export interface DemoOptions {
  objective: string;
  target: string;
  repoRoot: string;
  dataDir: string;
  reaBin?: string;
}

export interface DemoSummary {
  projectId: string;
  runId: string;
  status: string;
  steps: { title: string; status: string }[];
  evidenceIds: string[];
  hypotheses: Pick<Hypothesis, "id" | "statement" | "status">[];
  comparisons: MeasurementComparison[];
  conclusions: { statement: string; evidenceIds: string[] }[];
  failures: string[];
  limitations: string[];
  error?: string;
}

function log(section: string, body: string): void {
  console.log(`\n=== ${section} ===\n${body}`);
}

export async function runDemo(opts: DemoOptions): Promise<DemoSummary> {
  const { objective, repoRoot, dataDir } = opts;
  const targetRef = opts.target;
  const absTarget = isAbsolute(targetRef)
    ? targetRef
    : join(repoRoot, targetRef);
  if (!existsSync(absTarget)) {
    throw new Error(`target does not exist: ${absTarget}`);
  }

  // The demo needs a runnable JS reference for the experiment. For the
  // mini-kv target that is its committed compiled output.
  const referenceJs = join(absTarget, "dist", "index.js");
  if (!existsSync(referenceJs)) {
    throw new Error(
      `demo needs a compiled reference at ${referenceJs} — build the target first`,
    );
  }

  const previousReaBin = process.env.REA_BIN;
  const localRea = join(
    repoRoot,
    "node_modules",
    "rea-agents",
    "scripts",
    "rea.mjs",
  );
  if (opts.reaBin) {
    process.env.REA_BIN = opts.reaBin;
  } else if (existsSync(localRea)) {
    process.env.REA_BIN = localRea;
  }

  try {
    const engine: EngineDeps = {
      store: new FileStore({ dataDir }),
      executor: new LocalExecutor({ sandboxRoot: repoRoot }),
      repoRoot,
      dataDir,
      harnessScript: KV_BENCHMARK_HARNESS,
      measurements: [...KV_MEASUREMENTS],
      tscBin: join(repoRoot, "node_modules", "typescript", "lib", "tsc.js"),
    };
    const services = createServices(engine);

    const project = await services.createProject({
      name: `lab-demo ${new Date().toISOString()}`,
      objective,
    });
    log("project", `id=${project.id}\nobjective=${objective}`);
    const target = await services.addTarget(project.id, {
      kind: "repo",
      ref: targetRef,
    });
    log("target", `id=${target.id} kind=${target.kind} ref=${target.ref}`);

    let run = await services.startInvestigation(project.id);
    log(
      "plan",
      run.plan.map((s, i) => `${i + 1}. ${s.title}`).join("\n"),
    );

    // Register the runnable reference artifact BEFORE advancing: it becomes
    // the earliest implementation artifact, which codegen treats as the
    // reference for the alternative.
    mkdirSync(join(dataDir, "artifacts"), { recursive: true });
    const stagedReference = join(
      dataDir,
      "artifacts",
      `mini-kv-reference-${run.id}.js`,
    );
    copyFileSync(referenceJs, stagedReference);
    const referenceArtifact = await engine.store.addArtifact(run.id, {
      kind: "implementation",
      path: stagedReference,
      description: `Reference: compiled mini-kv (${referenceJs}) — Map-based store, lazy TTL expiry`,
    });
    log("reference artifact", `id=${referenceArtifact.id}\npath=${stagedReference}`);

    while (run.status === "running") {
      run = await services.advanceInvestigation(run.id, { maxSteps: 2 });
      for (const s of run.plan) {
        console.log(`  [${s.status}] ${s.title}`);
      }
    }
    log("run finished", `status=${run.status}`);

    if (run.status !== "completed") {
      return {
        projectId: project.id,
        runId: run.id,
        status: run.status,
        steps: run.plan.map((s) => ({ title: s.title, status: s.status })),
        evidenceIds: [],
        hypotheses: [],
        comparisons: [],
        conclusions: [],
        failures: [],
        limitations: [],
        error: run.error ?? "investigation did not complete",
      };
    }

    const results = await services.getInvestigationResults(run.id);
    const evidenceIds = results.evidence.map((e) => e.id);
    log(
      "evidence",
      results.evidence.map((e) => `${e.id}  ${e.type}`).join("\n"),
    );

    const comparisons: MeasurementComparison[] = [];
    const failures: string[] = [];
    for (const spec of results.experiments) {
      const exp = await services.getExperimentResults(spec.id);
      for (const r of exp.runs) {
        failures.push(...r.failures);
      }
      comparisons.push(...compareExperimentRuns(spec, exp.runs));
    }
    log(
      "measurements",
      comparisons
        .map((c) => {
          const ref = c.reference;
          const alt = c.alternative
            ? ` | alternative mean=${c.alternative.mean.toFixed(3)} (n=${c.alternative.n}) delta=${(c.deltaVsReference ?? 0).toFixed(3)}`
            : " | no alternative";
          return `${c.measurement}: reference mean=${ref.mean.toFixed(3)} (n=${ref.n}, min=${ref.min.toFixed(3)}, max=${ref.max.toFixed(3)})${alt}`;
        })
        .join("\n") || "(no experiments ran)",
    );

    const conclusions = results.conclusions.map((c) => ({
      statement: c.statement,
      evidenceIds: c.evidenceIds,
    }));
    log(
      "conclusions",
      conclusions.map((c) => c.statement).join("\n---\n") || "(none)",
    );

    const limitations = explainLimitations({
      limitations: results.evidence.flatMap((e) => e.limitations),
      unverified: [
        "behavioral equivalence of the alternative beyond the exercised procedure",
        "measurement noise on the lab host (wall-clock, shared VM)",
      ],
    });
    log("limitations", limitations);

    return {
      projectId: project.id,
      runId: run.id,
      status: run.status,
      steps: run.plan.map((s) => ({ title: s.title, status: s.status })),
      evidenceIds,
      hypotheses: results.hypotheses.map((h) => ({
        id: h.id,
        statement: h.statement,
        status: h.status,
      })),
      comparisons,
      conclusions,
      failures,
      limitations: results.evidence.flatMap((e) => e.limitations),
    };
  } finally {
    if (previousReaBin === undefined) {
      delete process.env.REA_BIN;
    } else {
      process.env.REA_BIN = previousReaBin;
    }
  }
}

function parseArgs(argv: string[]): { objective: string; target: string } {
  let objective = "";
  let target = "samples/mini-kv";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--objective") {
      objective = argv[i + 1] ?? "";
      i++;
    } else if (argv[i] === "--target") {
      target = argv[i + 1] ?? target;
      i++;
    }
  }
  if (!objective) {
    throw new Error('missing required flag: --objective "..."');
  }
  return { objective, target };
}

async function main(): Promise<void> {
  const { objective, target } = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const summary = await runDemo({
    objective,
    target,
    repoRoot,
    dataDir: process.env.REVERSE_LAB_DATA_DIR ?? join(repoRoot, "data"),
  });
  if (summary.error) {
    console.error(`\nDEMO FAILED: ${summary.error}`);
    process.exit(1);
  }
  console.log("\nDEMO OK — investigation completed.");
}

// Only run the CLI when executed directly (not when imported by tests).
if (process.argv[1]?.endsWith("lab-investigate.ts")) {
  main().catch((err) => {
    console.error(`\nDEMO FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
