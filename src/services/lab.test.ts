/**
 * Application service tests.
 *
 * Services are the single entry point for routes and the demo: they wrap
 * the Store and the orchestrator, validate inputs, and translate failures
 * into ServiceError(status, message). A FakeExecutor keeps these tests
 * hermetic — no step execution happens here except through the real
 * LocalExecutor in the runExperiment test (trivial harness script).
 */

import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore } from "../evidence/store";
import type { Executor } from "../execution/executor";
import type { EngineDeps } from "../investigation-engine/orchestrator";
import { createServices, ServiceError, type Services } from "./lab";

class FakeExecutor implements Executor {
  async run(): Promise<never> {
    throw new Error("not implemented in service tests");
  }
  async writeFiles(): Promise<void> {}
  async readFile(): Promise<string> {
    throw new Error("not implemented in service tests");
  }
}

function setup(): { services: Services; engine: EngineDeps } {
  const root = mkdtempSync(join(tmpdir(), "lab-services-"));
  const dataDir = join(root, "data");
  const engine: EngineDeps = {
    store: new FileStore({ dataDir }),
    executor: new FakeExecutor(),
    repoRoot: root,
    dataDir,
    harnessScript:
      "console.log(JSON.stringify({ measurements: { wall_time_ms: 1, correctness: 1 } }));",
    measurements: ["wall_time_ms", "correctness"],
    tscBin: join(root, "tsc.js"),
  };
  return { services: createServices(engine), engine };
}

async function expectServiceError(
  promise: Promise<unknown>,
  status: number,
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ServiceError);
    expect((err as ServiceError).status).toBe(status);
    return;
  }
  throw new Error(`expected ServiceError(${status}) but nothing was thrown`);
}

describe("projects and targets", () => {
  it("createProject validates name and objective", async () => {
    const { services } = setup();
    await expectServiceError(
      services.createProject({ name: "  ", objective: "o" }),
      400,
    );
    await expectServiceError(
      services.createProject({ name: "n", objective: "" }),
      400,
    );
    const project = await services.createProject({
      name: "n",
      objective: "o",
      constraints: ["c1"],
    });
    expect(project.constraints).toEqual(["c1"]);
  });

  it("getProjectDetails returns project, targets, and runs", async () => {
    const { services } = setup();
    await expectServiceError(services.getProjectDetails("nope"), 404);
    const project = await services.createProject({ name: "n", objective: "o" });
    await services.addTarget(project.id, { kind: "repo", ref: "samples/x" });
    const details = await services.getProjectDetails(project.id);
    expect(details.project.id).toBe(project.id);
    expect(details.targets).toHaveLength(1);
    expect(details.runs).toEqual([]);
  });

  it("addTarget validates kind, ref, and project existence", async () => {
    const { services } = setup();
    await expectServiceError(
      services.addTarget("nope", { kind: "repo", ref: "x" }),
      404,
    );
    const project = await services.createProject({ name: "n", objective: "o" });
    await expectServiceError(
      services.addTarget(project.id, { kind: "bogus", ref: "x" }),
      400,
    );
    await expectServiceError(
      services.addTarget(project.id, { kind: "repo", ref: "  " }),
      400,
    );
  });
});

describe("investigations", () => {
  it("startInvestigation plans and starts the run", async () => {
    const { services } = setup();
    const project = await services.createProject({ name: "n", objective: "o" });
    await services.addTarget(project.id, { kind: "repo", ref: "samples/x" });
    const run = await services.startInvestigation(project.id, "dig in");
    expect(run.status).toBe("running");
    expect(run.objective).toBe("dig in");
    expect(run.plan.length).toBeGreaterThan(0);
    await expectServiceError(services.startInvestigation("nope"), 404);
  });

  it("getInvestigationStatus 404s for unknown runs", async () => {
    const { services } = setup();
    await expectServiceError(services.getInvestigationStatus("nope"), 404);
  });

  it("getInvestigationResults aggregates run artifacts of the investigation", async () => {
    const { services } = setup();
    const project = await services.createProject({ name: "n", objective: "o" });
    const run = await services.startInvestigation(project.id);
    const results = await services.getInvestigationResults(run.id);
    expect(results.run.id).toBe(run.id);
    expect(results.findings).toEqual([]);
    expect(results.evidence.length).toBeGreaterThan(0);
    expect(results.hypotheses).toEqual([]);
    expect(results.conclusions).toEqual([]);
    expect(results.experiments).toEqual([]);
    await expectServiceError(services.getInvestigationResults("nope"), 404);
  });

  it("continueInvestigation rejects empty instructions and unknown runs", async () => {
    const { services } = setup();
    const project = await services.createProject({ name: "n", objective: "o" });
    const run = await services.startInvestigation(project.id);
    await expectServiceError(services.continueInvestigation(run.id, "  "), 400);
    await expectServiceError(
      services.continueInvestigation("nope", "do more"),
      404,
    );
  });

  it("advanceInvestigation 404s for unknown runs", async () => {
    const { services } = setup();
    await expectServiceError(services.advanceInvestigation("nope"), 404);
  });
});

describe("experiments", () => {
  it("createExperiment validates the spec and the investigation", async () => {
    const { services } = setup();
    await expectServiceError(
      services.createExperiment("nope", {
        objective: "o",
        reference: { artifactId: "r" },
        procedure: ["p"],
        measurements: ["m"],
        repetitions: 1,
        acceptance: "a",
      }),
      404,
    );
    const project = await services.createProject({ name: "n", objective: "o" });
    const run = await services.startInvestigation(project.id);
    await expectServiceError(
      services.createExperiment(run.id, {
        objective: "",
        reference: { artifactId: "r" },
        procedure: ["p"],
        measurements: ["m"],
        repetitions: 1,
        acceptance: "a",
      }),
      400,
    );
  });

  it("runExperiment executes and getExperimentResults compares", async () => {
    const { services, engine } = setup();
    const project = await services.createProject({ name: "n", objective: "o" });
    const run = await services.startInvestigation(project.id);
    const artifactFile = join(engine.repoRoot, "ref.js");
    writeFileSync(artifactFile, "module.exports = {};\n");
    const artifact = await engine.store.addArtifact(run.id, {
      kind: "implementation",
      path: artifactFile,
      description: "ref",
    });
    const spec = await services.createExperiment(run.id, {
      objective: "smoke",
      reference: { artifactId: artifact.id },
      procedure: ["run trivial harness"],
      measurements: ["wall_time_ms", "correctness"],
      repetitions: 2,
      acceptance: "runs",
    });
    const expRun = await services.runExperiment(spec.id);
    expect(expRun.status).toBe("completed");
    expect(expRun.rawValues["reference.wall_time_ms"]).toHaveLength(2);
    expect(expRun.environment.nodeVersion).toBe(process.version);
    // The sandbox cwd lives under <dataDir>/sandbox/<runId> — never in the
    // repo root or the caller's cwd (regression: the orchestrator once
    // passed a mismatched executor root and scattered run dirs).
    const sandboxEntries = readdirSync(join(engine.dataDir, "sandbox"));
    expect(sandboxEntries).toContain(expRun.id);

    const results = await services.getExperimentResults(spec.id);
    expect(results.spec.id).toBe(spec.id);
    expect(results.runs).toHaveLength(1);
    expect(results.comparisons).toHaveLength(2);
    expect(results.comparisons[0]?.reference.n).toBe(2);
    await expectServiceError(services.getExperimentResults("nope"), 404);
    await expectServiceError(services.runExperiment("nope"), 404);
  });
});
