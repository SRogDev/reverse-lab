/**
 * Experiment runner — executes an ExperimentSpec and records real measurements.
 *
 * MVP protocol (deterministic, documented):
 * 1. Load the spec; resolve the reference and (optional) alternative
 *    artifacts to files on this host via `deps.artifactPath`.
 * 2. Create a FRESH sandbox cwd per run (`<sandboxRoot>/<runId>/`) and copy
 *    the variant files plus the harness script into it through the executor.
 *    `deps.executor` must be rooted at `deps.sandboxRoot` (e.g.
 *    `new LocalExecutor({ sandboxRoot })`).
 * 3. For each variant (reference, then alternative) and each repetition,
 *    run `node harness.mjs <variantFile>` inside the sandbox. The child
 *    runs with a scrubbed env and a timeout; it is a separate process, so
 *    artifact code never executes in the lab process.
 * 4. Parse the harness stdout as the HarnessResult below. Missing or
 *    non-numeric spec measurements, non-zero exits, timeouts, and
 *    unparseable output are RECORDED as failures — never hidden — and mark
 *    the run `failed` (partial rawValues are kept).
 * 5. Record the ExperimentRun with FULL context: environment (node version,
 *    platform, arch), rawValues namespaced as `reference.<m>` /
 *    `alternative.<m>`, failures[], notes.
 *
 * HARNESS PROTOCOL (what `deps.harnessScript` must implement):
 * - argv: `node harness.mjs <variantFile>` (variantFile lives in the cwd).
 * - stdout: JSON `{ "measurements": { "<name>": <number>, ... } }`.
 * - exit 0 on success; anything else is a failure (stderr tail is recorded).
 *
 * Comparisons (`compareExperimentRuns`) are raw stats only — n, mean, min,
 * max, deltaVsReference. No composite scores are ever invented.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { NotFoundError, type Store } from "../evidence/store";
import type { Executor } from "../execution/executor";
import { type ExperimentRun, type ExperimentSpec, nowIso } from "../types";

/** JS source of the harness script (see HARNESS PROTOCOL above). */
export type BenchmarkHarnessScript = string;

export interface RunnerDeps {
  store: Store;
  /** Must be rooted at `sandboxRoot` (e.g. new LocalExecutor({ sandboxRoot })). */
  executor: Executor;
  sandboxRoot: string;
  /** Resolve an artifact id to an absolute file path readable on this host. */
  artifactPath: (artifactId: string) => Promise<string>;
  harnessScript: BenchmarkHarnessScript;
}

export interface MeasurementStats {
  n: number;
  mean: number;
  min: number;
  max: number;
}

export interface MeasurementComparison {
  measurement: string;
  reference: MeasurementStats;
  alternative?: MeasurementStats;
  /** alternative.mean - reference.mean; present only when both ran. */
  deltaVsReference?: number;
}

/** What the harness must print on stdout. */
interface HarnessResult {
  measurements: Record<string, number>;
}

function isHarnessResult(value: unknown): value is HarnessResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const measurements = (value as Record<string, unknown>).measurements;
  if (typeof measurements !== "object" || measurements === null) {
    return false;
  }
  return Object.values(measurements).every((v) => typeof v === "number");
}

function stats(values: number[]): MeasurementStats {
  if (values.length === 0) {
    return { n: 0, mean: NaN, min: NaN, max: NaN };
  }
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) {
      min = v;
    }
    if (v > max) {
      max = v;
    }
  }
  return { n: values.length, mean: sum / values.length, min, max };
}

function collectEnvironment(): Record<string, unknown> {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

interface Variant {
  name: "reference" | "alternative";
  artifactId: string;
}

function parseHarnessStdout(
  stdout: string,
  context: string,
): { measurements?: Record<string, number>; failure?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return {
      failure: `${context}: harness stdout is not JSON: ${stdout.slice(0, 300)}`,
    };
  }
  if (!isHarnessResult(parsed)) {
    return {
      failure:
        `${context}: harness result is not { measurements: { name: number } }: ` +
        `${stdout.slice(0, 300)}`,
    };
  }
  return { measurements: parsed.measurements };
}

/**
 * Execute one experiment spec end to end. Returns the recorded
 * ExperimentRun (status `completed`, or `failed` with failures[] listing
 * exactly what went wrong).
 */
export async function runExperiment(
  deps: RunnerDeps,
  experimentId: string,
  opts?: { timeoutMs?: number },
): Promise<ExperimentRun> {
  const spec = await deps.store.getExperiment(experimentId);
  if (!spec) {
    throw new NotFoundError("Experiment", experimentId);
  }
  const timeoutMs = opts?.timeoutMs ?? 120_000;

  const run = await deps.store.addExperimentRun(experimentId, {
    environment: collectEnvironment(),
    notes:
      `runner=local-executor; harness=argv-json-protocol; ` +
      `repetitions=${spec.repetitions}`,
  });
  await deps.store.updateExperimentRun(run.id, { status: "running" });

  const failures: string[] = [];
  const rawValues: Record<string, number[]> = {};
  const cwd = run.id; // fresh sandbox cwd per run, under sandboxRoot
  const stagedFiles = new Map<"reference" | "alternative", string>();

  const variants: Variant[] = [
    { name: "reference", artifactId: spec.reference.artifactId },
  ];
  if (spec.alternative) {
    variants.push({
      name: "alternative",
      artifactId: spec.alternative.artifactId,
    });
  }

  try {
    // Stage the variant files and the harness inside the sandbox cwd.
    const files: Record<string, string> = {
      "harness.mjs": deps.harnessScript,
    };
    for (const variant of variants) {
      let artifactFile: string;
      try {
        artifactFile = await deps.artifactPath(variant.artifactId);
      } catch (err) {
        throw new Error(
          `cannot resolve ${variant.name} artifact ${variant.artifactId}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const staged = `${variant.name}-${basename(artifactFile)}`;
      try {
        files[staged] = await readFile(artifactFile, "utf8");
      } catch (err) {
        throw new Error(
          `cannot read ${variant.name} artifact file ${artifactFile}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
      stagedFiles.set(variant.name, staged);
    }
    await deps.executor.writeFiles(cwd, files);

    for (const variant of variants) {
      const staged = stagedFiles.get(variant.name);
      if (!staged) {
        continue;
      }
      for (let rep = 1; rep <= spec.repetitions; rep++) {
        const context = `${variant.name} repetition ${rep}/${spec.repetitions}`;
        let result;
        try {
          result = await deps.executor.run("node", ["harness.mjs", staged], {
            cwd,
            timeoutMs,
          });
        } catch (err) {
          failures.push(
            `${context}: harness spawn failed: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
        if (result.timedOut) {
          failures.push(`${context}: harness timed out after ${timeoutMs}ms`);
          continue;
        }
        if (result.exitCode !== 0) {
          failures.push(
            `${context}: harness exited ${result.exitCode}: ` +
              `${result.stderr.slice(0, 500)}`,
          );
          continue;
        }
        const { measurements, failure } = parseHarnessStdout(
          result.stdout.trim(),
          context,
        );
        if (failure || !measurements) {
          failures.push(failure ?? `${context}: empty harness result`);
          continue;
        }
        for (const name of spec.measurements) {
          const value = measurements[name];
          if (typeof value !== "number" || Number.isNaN(value)) {
            failures.push(
              `${context}: missing or non-numeric measurement "${name}"`,
            );
            continue;
          }
          const key = `${variant.name}.${name}`;
          rawValues[key] = rawValues[key] ?? [];
          rawValues[key].push(value);
        }
      }
    }
  } catch (err) {
    failures.push(
      `run setup failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return deps.store.updateExperimentRun(run.id, {
    status: failures.length > 0 ? "failed" : "completed",
    finishedAt: nowIso(),
    environment: collectEnvironment(),
    rawValues,
    failures,
  });
}

/**
 * Compare experiment runs against the spec. Pure function: per measurement,
 * raw stats for reference and (when present) alternative, plus the plain
 * arithmetic delta of the means. Values are concatenated across runs, so
 * repeated executions accumulate honestly.
 */
export function compareExperimentRuns(
  spec: ExperimentSpec,
  runs: ExperimentRun[],
): MeasurementComparison[] {
  return spec.measurements.map((measurement) => {
    const referenceValues = runs.flatMap(
      (r) => r.rawValues[`reference.${measurement}`] ?? [],
    );
    const alternativeValues = runs.flatMap(
      (r) => r.rawValues[`alternative.${measurement}`] ?? [],
    );
    const reference = stats(referenceValues);
    const comparison: MeasurementComparison = { measurement, reference };
    if (alternativeValues.length > 0) {
      const alternative = stats(alternativeValues);
      comparison.alternative = alternative;
      comparison.deltaVsReference = alternative.mean - reference.mean;
    }
    return comparison;
  });
}
