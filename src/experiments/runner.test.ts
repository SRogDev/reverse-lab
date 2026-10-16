/**
 * Experiment runner tests.
 *
 * The runner executes a spec's procedure through the sandbox executor,
 * collects spec.measurements × repetitions, and records FULL context.
 * Comparisons are raw stats only — no invented composite scores.
 *
 * A FakeExecutor stands in for LocalExecutor: it serves canned harness
 * stdout instead of spawning node. The demo (and the labeled integration
 * test) exercise the real path.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore, NotFoundError, type Store } from "../evidence/store";
import type { Executor, RunResult } from "../execution/executor";
import {
  compareExperimentRuns,
  type RunnerDeps,
  runExperiment,
} from "./runner";

const HARNESS_OK = JSON.stringify({
  measurements: { wall_time_ms: 10, correctness: 1 },
});

class FakeExecutor implements Executor {
  readonly written = new Map<string, string>();
  constructor(private readonly harnessStdout: string = HARNESS_OK) {}
  async run(
    _cmd: string,
    args: string[],
    _opts: { cwd: string; timeoutMs: number },
  ): Promise<RunResult> {
    if (args.some((a) => a.includes("harness"))) {
      return {
        exitCode: 0,
        stdout: this.harnessStdout,
        stderr: "",
        durationMs: 5,
        timedOut: false,
      };
    }
    throw new Error(`unexpected command: ${_cmd} ${args.join(" ")}`);
  }
  async writeFiles(cwd: string, files: Record<string, string>): Promise<void> {
    for (const [p, c] of Object.entries(files)) {
      this.written.set(`${cwd}/${p}`, c);
    }
  }
  async readFile(cwd: string, path: string): Promise<string> {
    const content = this.written.get(`${cwd}/${path}`);
    if (content === undefined) {
      throw new Error(`not written: ${cwd}/${path}`);
    }
    return content;
  }
}

async function setup(harnessStdout: string = HARNESS_OK): Promise<{
  deps: RunnerDeps;
  store: Store;
  executor: FakeExecutor;
  specId: string;
}> {
  const dataDir = mkdtempSync(join(tmpdir(), "lab-runner-"));
  const sandboxRoot = mkdtempSync(join(tmpdir(), "lab-sandbox-"));
  const store = new FileStore({ dataDir });
  const executor = new FakeExecutor(harnessStdout);
  const project = await store.createProject({
    name: "p",
    objective: "compare kv variants",
  });
  const run = await store.createRun({
    projectId: project.id,
    objective: "compare",
  });
  const ref = await store.addArtifact(run.id, {
    kind: "implementation",
    path: "/tmp/ref.js",
    description: "reference",
  });
  const alt = await store.addArtifact(run.id, {
    kind: "implementation",
    path: "/tmp/alt.js",
    description: "alternative",
  });
  const spec = await store.createExperiment(run.id, {
    objective: "compare wall time",
    reference: { artifactId: ref.id },
    alternative: { artifactId: alt.id },
    procedure: ["run harness against each artifact"],
    measurements: ["wall_time_ms", "correctness"],
    repetitions: 3,
    acceptance: "alternative within 2x of reference wall time",
  });
  const deps: RunnerDeps = {
    store,
    executor,
    sandboxRoot,
    artifactPath: async (id: string) => {
      const file = join(dataDir, `${id}.js`);
      writeFileSync(file, "// fake artifact\nmodule.exports = {};\n");
      return file;
    },
    harnessScript: "// fake harness — FakeExecutor intercepts execution",
  };
  return { deps, store, executor, specId: spec.id };
}

describe("runExperiment", () => {
  it("collects spec.measurements × repetitions for reference and alternative", async () => {
    const { deps, specId } = await setup();
    const run = await runExperiment(deps, specId);
    expect(run.status).toBe("completed");
    expect(run.rawValues["reference.wall_time_ms"]).toHaveLength(3);
    expect(run.rawValues["alternative.wall_time_ms"]).toHaveLength(3);
    expect(run.rawValues["reference.correctness"]).toEqual([1, 1, 1]);
    expect(run.failures).toEqual([]);
    expect(run.finishedAt).toBeDefined();
  });

  it("records full environment context", async () => {
    const { deps, specId } = await setup();
    const run = await runExperiment(deps, specId);
    expect(run.environment.nodeVersion).toBe(process.version);
    expect(run.environment.platform).toBe(process.platform);
    expect(run.environment.arch).toBe(process.arch);
  });

  it("records harness failures visibly instead of hiding them", async () => {
    const { deps, specId } = await setup("this is not json");
    const run = await runExperiment(deps, specId);
    expect(run.status).toBe("failed");
    expect(run.failures.length).toBeGreaterThan(0);
    expect(run.failures.join("\n")).toMatch(/parse|json/i);
  });

  it("records a failure when a spec measurement is missing from harness output", async () => {
    const { deps, specId } = await setup(
      JSON.stringify({ measurements: { wall_time_ms: 10 } }),
    );
    const run = await runExperiment(deps, specId);
    expect(run.status).toBe("failed");
    expect(run.failures.join("\n")).toMatch(/correctness/);
  });

  it("throws NotFoundError for an unknown experiment id", async () => {
    const { deps } = await setup();
    await expect(runExperiment(deps, "no-such-experiment")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("writes the harness and artifacts into a fresh sandbox cwd per run", async () => {
    const { deps, executor, specId } = await setup();
    const run = await runExperiment(deps, specId);
    const keys = [...executor.written.keys()];
    expect(keys.some((k) => k.startsWith(`${run.id}/`))).toBe(true);
    expect(keys.some((k) => k.endsWith("harness.mjs"))).toBe(true);
  });
});

describe("compareExperimentRuns", () => {
  it("computes raw per-measurement stats and delta vs reference", () => {
    const spec = {
      measurements: ["wall_time_ms"],
    } as unknown as Parameters<typeof compareExperimentRuns>[0];
    const runs = [
      {
        rawValues: {
          "reference.wall_time_ms": [10, 20, 30],
          "alternative.wall_time_ms": [5, 10, 15],
        },
      },
    ] as unknown as Parameters<typeof compareExperimentRuns>[1];
    const [cmp] = compareExperimentRuns(spec, runs);
    expect(cmp.measurement).toBe("wall_time_ms");
    expect(cmp.reference).toEqual({ n: 3, mean: 20, min: 10, max: 30 });
    expect(cmp.alternative).toEqual({ n: 3, mean: 10, min: 5, max: 15 });
    expect(cmp.deltaVsReference).toBe(-10);
  });

  it("omits deltaVsReference when no alternative ran", () => {
    const spec = {
      measurements: ["wall_time_ms"],
    } as unknown as Parameters<typeof compareExperimentRuns>[0];
    const runs = [
      { rawValues: { "reference.wall_time_ms": [10] } },
    ] as unknown as Parameters<typeof compareExperimentRuns>[1];
    const [cmp] = compareExperimentRuns(spec, runs);
    expect(cmp.alternative).toBeUndefined();
    expect(cmp.deltaVsReference).toBeUndefined();
  });
});
