/**
 * Orchestrator tests — the investigation run lifecycle on the Store.
 *
 * A FakeExecutor serves canned REA evidence (never the real CLI) so these
 * unit tests stay fast and hermetic. Most objectives avoid the words
 * "alternative"/"experiment" so no codegen/tsc is needed here; the full
 * pipeline (codegen + experiment) is covered by the labeled demo
 * integration test with real executors. The LLM-codegen dispatch tests
 * at the bottom are the exception: a SynthesisExecutor fakes tsc success
 * so only the planner→orchestrator→module routing is exercised.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore, type Store } from "../evidence/store";
import type { Executor, RunResult } from "../execution/executor";
import {
  advanceInvestigation,
  continueInvestigation,
  type EngineDeps,
  revisePlan,
  startInvestigation,
} from "./orchestrator";

const EVIDENCE_ID = `ev_${"b".repeat(64)}`;

function cannedReaEvidence(target: string): string {
  return JSON.stringify({
    evidence_id: EVIDENCE_ID,
    subject: { path: target },
    provider: { id: "test", name: "test", version: "0" },
    analysis_profile: {},
    predicate_type: "test",
    operation: "analyze_javascript_application",
    parameters: {},
    raw_result: {},
    normalized_result: { entryPoints: ["src/index.ts"], modules: 1 },
    confidence: "high",
    authority: "shipped-artifact",
    environment: {},
    limitations: ["test limitation: static analysis only"],
    relationship_coverage: {},
    locations: [],
    evidence_links: [],
  });
}

class FakeExecutor implements Executor {
  constructor(private readonly behavior: "ok" | "fail" | "flaky") {}
  private calls = 0;
  async run(
    cmd: string,
    args: string[],
    _opts: { cwd: string; timeoutMs: number },
  ): Promise<RunResult> {
    this.calls += 1;
    if (this.behavior === "fail") {
      throw new Error("boom: spawn failed");
    }
    if (this.behavior === "flaky" && this.calls === 1) {
      throw new Error("boom: first attempt fails");
    }
    if (!args.some((a) => a.includes("analyze-javascript-application"))) {
      throw new Error(`unexpected REA command: ${cmd} ${args.join(" ")}`);
    }
    const target = args[args.length - 2] ?? "unknown";
    return {
      exitCode: 0,
      stdout: cannedReaEvidence(target),
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  }
  async writeFiles(
    _cwd: string,
    _files: Record<string, string>,
  ): Promise<void> {}
  async readFile(_cwd: string, _path: string): Promise<string> {
    throw new Error("not implemented");
  }
}

async function setup(
  behavior: "ok" | "fail" | "flaky" = "ok",
): Promise<{ deps: EngineDeps; projectId: string }> {
  const root = mkdtempSync(join(tmpdir(), "lab-orch-"));
  const store: Store = new FileStore({ dataDir: join(root, "data") });
  const deps: EngineDeps = {
    store,
    executor: new FakeExecutor(behavior),
    repoRoot: root,
    dataDir: join(root, "data"),
    harnessScript: "// unused in these tests",
    measurements: ["wall_time_ms", "correctness"],
    tscBin: join(root, "tsc.js"),
  };
  const project = await store.createProject({
    name: "mini-kv lab",
    objective: "understand how the mini-kv store works",
  });
  await store.createTarget({
    projectId: project.id,
    kind: "repo",
    ref: "samples/mini-kv",
  });
  return { deps, projectId: project.id };
}

describe("startInvestigation", () => {
  it("creates a running run with the planned steps persisted", async () => {
    const { deps, projectId } = await setup();
    const run = await startInvestigation(deps, projectId);
    expect(run.status).toBe("running");
    expect(run.plan.length).toBeGreaterThan(0);
    expect(run.plan.every((s) => s.status === "pending")).toBe(true);
    const evidence = await deps.store.listEvidence(run.id);
    expect(evidence.some((e) => e.type === "investigation:plan")).toBe(true);
  });

  it("throws for an unknown project", async () => {
    const { deps } = await setup();
    await expect(startInvestigation(deps, "no-such-project")).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("advanceInvestigation", () => {
  it("executes the plan end to end: evidence in, hypotheses stay hypotheses", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(deps, projectId);
    const run = await advanceInvestigation(deps, started.id);
    expect(run.status).toBe("completed");
    expect(run.plan.every((s) => s.status === "completed")).toBe(true);

    const evidence = await deps.store.listEvidence(run.id);
    expect(evidence.some((e) => e.id === EVIDENCE_ID)).toBe(true);

    const hypotheses = await deps.store.listHypotheses(run.id);
    expect(hypotheses.length).toBeGreaterThan(0);
    expect(hypotheses.every((h) => h.status === "proposed")).toBe(true);

    const findings = await deps.store.listFindings(run.id);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.status === "provisional")).toBe(true);
  });

  it("advances at most maxSteps per call", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(deps, projectId);
    const total = started.plan.length;
    const run = await advanceInvestigation(deps, started.id, { maxSteps: 2 });
    const completed = run.plan.filter((s) => s.status === "completed");
    expect(completed).toHaveLength(2);
    expect(run.status).toBe("running");
    expect(total).toBeGreaterThan(2);
  });

  it("retries a failed step once, then continues", async () => {
    const { deps, projectId } = await setup("flaky");
    const started = await startInvestigation(deps, projectId);
    const run = await advanceInvestigation(deps, started.id, { maxSteps: 1 });
    expect(run.plan[0]?.status).toBe("completed");
    expect(run.status).toBe("running");
  });

  it("marks the run failed (visibly) after two failed attempts", async () => {
    const { deps, projectId } = await setup("fail");
    const started = await startInvestigation(deps, projectId);
    const run = await advanceInvestigation(deps, started.id, { maxSteps: 1 });
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/failed after 2 attempts/);
    expect(run.plan[0]?.status).toBe("failed");
    expect(run.plan[0]?.detail).toMatch(/attempt 2/);
    expect(run.plan[0]?.detail).toMatch(/boom/);
  });

  it("refuses to advance a failed run", async () => {
    const { deps, projectId } = await setup("fail");
    const started = await startInvestigation(deps, projectId);
    const failed = await advanceInvestigation(deps, started.id, {
      maxSteps: 1,
    });
    await expect(advanceInvestigation(deps, failed.id)).rejects.toThrow(
      /failed/i,
    );
  });
});

describe("revisePlan", () => {
  it("keeps completed steps and prior findings, replaces pending steps", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(deps, projectId);
    const partial = await advanceInvestigation(deps, started.id, {
      maxSteps: 2,
    });
    const completedBefore = partial.plan.filter(
      (s) => s.status === "completed",
    ).length;
    expect(completedBefore).toBe(2);

    const revised = await revisePlan(deps, started.id);
    const kept = revised.plan.filter((s) => s.status === "completed");
    expect(kept).toHaveLength(completedBefore);
    expect(revised.plan.every((s) => s.status !== "failed")).toBe(true);

    // Finish the revised plan — it must still complete.
    const finished = await advanceInvestigation(deps, started.id);
    expect(finished.status).toBe("completed");
  });

  it("never deletes evidence, hypotheses, or findings", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(deps, projectId);
    await advanceInvestigation(deps, started.id);
    const evidenceBefore = await deps.store.listEvidence(started.id);
    const hypothesesBefore = await deps.store.listHypotheses(started.id);
    const findingsBefore = await deps.store.listFindings(started.id);
    await revisePlan(deps, started.id);
    const evidenceAfter = await deps.store.listEvidence(started.id);
    // The revision itself adds exactly one plan-revision record; every
    // prior record must still be present.
    expect(evidenceAfter.length).toBe(evidenceBefore.length + 1);
    for (const e of evidenceBefore) {
      expect(evidenceAfter.some((x) => x.id === e.id)).toBe(true);
    }
    expect(await deps.store.listHypotheses(started.id)).toEqual(
      hypothesesBefore,
    );
    expect(await deps.store.listFindings(started.id)).toEqual(findingsBefore);
  });
});

describe("continueInvestigation", () => {
  it("appends planned steps from the instruction and reuses prior work", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(deps, projectId);
    const finished = await advanceInvestigation(deps, started.id);
    expect(finished.status).toBe("completed");
    const stepsBefore = finished.plan.length;

    const continued = await continueInvestigation(
      deps,
      started.id,
      "also inspect the sqlite database at data/app.sqlite",
    );
    expect(continued.plan.length).toBeGreaterThan(stepsBefore);
    expect(
      continued.plan
        .slice(stepsBefore)
        .map((s) => s.title)
        .join("\n"),
    ).toMatch(/rea-sqlite/i);
    expect(continued.status).toBe("running");

    // Prior evidence is reused, hypotheses stay hypotheses.
    const evidence = await deps.store.listEvidence(started.id);
    expect(evidence.some((e) => e.id === EVIDENCE_ID)).toBe(true);
    const hypotheses = await deps.store.listHypotheses(started.id);
    expect(hypotheses.every((h) => h.status === "proposed")).toBe(true);
  });

  it("rejects an empty instruction", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(deps, projectId);
    await expect(continueInvestigation(deps, started.id, "  ")).rejects.toThrow(
      /instruction is required/i,
    );
  });
});

describe("directory targets (reference artifact resolution)", () => {
  it("registers the runnable entrypoint as the reference artifact when the target is a directory", async () => {
    const { deps, projectId } = await setup();
    const entry = join(deps.repoRoot, "samples", "mini-kv", "dist", "index.js");
    mkdirSync(dirname(entry), { recursive: true });
    writeFileSync(entry, "module.exports = {};\n");
    const started = await startInvestigation(deps, projectId);
    const run = await advanceInvestigation(deps, started.id, { maxSteps: 1 });
    expect(run.plan[0]?.status).toBe("completed");
    const artifacts = await deps.store.listArtifacts(run.id);
    const reference = artifacts.find((a) => a.kind === "implementation");
    expect(reference?.path).toBe(
      join("samples", "mini-kv", "dist", "index.js"),
    );
  });

  it("designExperiment refuses honestly when the reference artifact is a directory", async () => {
    const { deps, projectId } = await setup();
    mkdirSync(join(deps.repoRoot, "samples", "mini-kv"), { recursive: true });
    const run = await deps.store.createRun({
      projectId,
      objective: "compare the mini-kv implementation",
    });
    await deps.store.addArtifact(run.id, {
      kind: "implementation",
      path: "samples/mini-kv",
      description: "Reference target inspected (directory, not runnable)",
    });
    const designStep = {
      id: "design-1",
      title:
        "Design experiment: procedure, measurements, repetitions, acceptance",
      status: "pending" as const,
      detail: "internal: ExperimentSpec with reference artifact",
    };
    await deps.store.updateRun(run.id, {
      status: "running",
      plan: [designStep],
    });
    const advanced = await advanceInvestigation(deps, run.id);
    expect(advanced.status).toBe("failed");
    expect(advanced.plan[0]?.status).toBe("failed");
    expect(advanced.plan[0]?.detail).toMatch(/not a runnable file/i);
  });
});

/**
 * LLM codegen dispatch (feat/llm-codegen): with a synthesizing provider
 * wired, an alternative-implementation objective plans a
 * codegen-llm-typescript step and the orchestrator executes it through
 * the synthesis module. The executor fake answers tsc/probe invocations
 * with success; verification rigor lives in llm-codegen.test.ts (real
 * Executor + real tsc).
 */
class SynthesisExecutor extends FakeExecutor {
  override async run(
    cmd: string,
    args: string[],
    opts: { cwd: string; timeoutMs: number },
  ): Promise<RunResult> {
    if (args.some((a) => a.includes("analyze-javascript-application"))) {
      return super.run(cmd, args, opts);
    }
    // tsc typecheck/emit and probe runs: succeed without executing.
    return {
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
      timedOut: false,
    };
  }
}

class FakeSynthesisProvider {
  readonly providerLabel = "fake-synthesis (orchestrator test)";
  readonly modelId = "fake-synthesis-1";
  async complete(_prompt: string): Promise<string> {
    return [
      "```ts",
      "export function get(key: string): string | undefined {",
      "  return undefined;",
      "}",
      "```",
    ].join("\n");
  }
}

describe("LLM codegen step dispatch", () => {
  it("plans and executes codegen-llm-typescript when a real provider is wired", async () => {
    const { deps, projectId } = await setup();
    const synthDeps: EngineDeps = {
      ...deps,
      executor: new SynthesisExecutor("ok"),
      modelProvider: new FakeSynthesisProvider(),
    };
    const started = await startInvestigation(
      synthDeps,
      projectId,
      "build a simpler alternative to the mini-kv store",
    );
    const synthStep = started.plan.find((s) =>
      (s.detail ?? "").includes("capability=codegen-llm-typescript"),
    );
    expect(synthStep).toBeDefined();

    const synthIndex = started.plan.findIndex((s) =>
      (s.detail ?? "").includes("capability=codegen-llm-typescript"),
    );
    const run = await advanceInvestigation(synthDeps, started.id, {
      maxSteps: synthIndex + 1,
    });
    expect(run.plan[synthIndex]?.status).toBe("completed");

    const artifacts = await synthDeps.store.listArtifacts(run.id);
    expect(
      artifacts.some((a) =>
        a.description.startsWith("Alternative implementation (LLM synthesis"),
      ),
    ).toBe(true);
    const evidence = await synthDeps.store.listEvidence(run.id);
    expect(evidence.some((e) => e.type === "codegen:llm-typescript")).toBe(
      true,
    );
  });

  it("without a provider the plan keeps the template step and records the limitation", async () => {
    const { deps, projectId } = await setup();
    const started = await startInvestigation(
      deps,
      projectId,
      "build a simpler alternative to the mini-kv store",
    );
    expect(
      started.plan.some((s) =>
        (s.detail ?? "").includes("capability=codegen-typescript"),
      ),
    ).toBe(true);
    expect(
      started.plan.some((s) =>
        (s.detail ?? "").includes("capability=codegen-llm-typescript"),
      ),
    ).toBe(false);
    const evidence = await deps.store.listEvidence(started.id);
    const planEvidence = evidence.find((e) => e.type === "investigation:plan");
    expect(planEvidence?.limitations.join("\n")).toMatch(
      /codegen-llm-typescript.*unavailable/i,
    );
  });
});
