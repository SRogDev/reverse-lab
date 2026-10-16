import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { FileStore, SupabaseStore } from "./store";

function freshStore(): { store: FileStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "rl-store-"));
  return { store: new FileStore({ dataDir: dir }), dir };
}

describe("FileStore", () => {
  let store: FileStore;
  let dir: string;

  beforeEach(() => {
    ({ store, dir } = freshStore());
  });

  it("round-trips projects", async () => {
    const created = await store.createProject({
      name: "mini-kv",
      objective: "understand TTL expiry",
      constraints: ["no network"],
    });
    expect(created.id).not.toBe("");
    expect(created.constraints).toEqual(["no network"]);

    expect(await store.getProject(created.id)).toEqual(created);
    expect(await store.getProject("nope")).toBeNull();

    const listed = await store.listProjects();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("mini-kv");
  });

  it("isolates targets per project", async () => {
    const a = await store.createProject({ name: "a", objective: "oa" });
    const b = await store.createProject({ name: "b", objective: "ob" });
    await store.createTarget({ projectId: a.id, kind: "component", ref: "x" });
    await store.createTarget({ projectId: a.id, kind: "repo", ref: "y" });
    await store.createTarget({ projectId: b.id, kind: "docs", ref: "z" });

    expect(await store.listTargets(a.id)).toHaveLength(2);
    expect(await store.listTargets(b.id)).toHaveLength(1);
  });

  it("runs the investigation run lifecycle with plan steps", async () => {
    const project = await store.createProject({ name: "p", objective: "o" });
    const run = await store.createRun({
      projectId: project.id,
      objective: "investigate",
    });
    expect(run.status).toBe("pending");
    expect(run.plan).toEqual([]);

    const step = await store.addStep(run.id, {
      title: "inspect target",
      detail: "run REA",
    });
    expect(step.status).toBe("pending");

    const updated = await store.updateStep(run.id, step.id, {
      status: "running",
    });
    expect(updated.status).toBe("running");

    const running = await store.updateRunStatus(run.id, "running");
    expect(running.status).toBe("running");

    const failed = await store.updateRunStatus(run.id, "failed", "boom");
    expect(failed.error).toBe("boom");

    const fetched = await store.getRun(run.id);
    expect(fetched?.plan[0]?.status).toBe("running");
    expect(fetched?.status).toBe("failed");

    expect(await store.listRuns(project.id)).toHaveLength(1);
    await expect(store.updateRunStatus("missing", "failed")).rejects.toThrow(
      /not found/,
    );
  });

  it("stores REA evidence under its own id and dedups re-ingestion", async () => {
    const run = await store.createRun({
      projectId: "p1",
      objective: "o",
    });
    const input = {
      id: `ev_${"c".repeat(64)}`,
      type: "rea:analyze_javascript_application",
      source: "rea-agents@6.5.0",
      observation: '{"modules":2}',
      limitations: ["static only"],
      verification: "observed" as const,
      provenance: { tool: "analyze_javascript_application" },
    };
    const first = await store.addEvidence(run.id, input);
    expect(first.id).toBe(input.id);

    // Same content re-ingested -> same id, no duplicate row.
    const second = await store.addEvidence(run.id, input);
    expect(second.id).toBe(first.id);
    expect(await store.listEvidence(run.id)).toHaveLength(1);
  });

  it("generates content-addressed lab-ev ids for lab evidence", async () => {
    const run = await store.createRun({ projectId: "p1", objective: "o" });
    const input = {
      type: "lab:note",
      source: "investigator",
      observation: "ttl uses Date.now()",
      limitations: [] as string[],
      verification: "inferred" as const,
      provenance: {},
    };
    const evidence = await store.addEvidence(run.id, input);
    expect(evidence.id).toMatch(/^lab-ev-[0-9a-f]{64}$/);

    // Deterministic: identical content -> identical id (dedup).
    const again = await store.addEvidence(run.id, input);
    expect(again.id).toBe(evidence.id);
    expect(await store.listEvidence(run.id)).toHaveLength(1);

    // Different content -> different id.
    const other = await store.addEvidence(run.id, {
      ...input,
      observation: "something else",
    });
    expect(other.id).not.toBe(evidence.id);
    expect(await store.listEvidence(run.id)).toHaveLength(2);
  });

  it("manages findings with status transitions", async () => {
    const run = await store.createRun({ projectId: "p1", objective: "o" });
    const finding = await store.addFinding(run.id, {
      title: "wall-clock TTL",
      body: "expiry compares Date.now()",
      evidenceIds: ["ev_1"],
    });
    expect(finding.status).toBe("provisional");

    const confirmed = await store.updateFindingStatus(finding.id, "confirmed");
    expect(confirmed.status).toBe("confirmed");
    expect(await store.listFindings(run.id)).toHaveLength(1);
  });

  it("manages hypotheses", async () => {
    const run = await store.createRun({ projectId: "p1", objective: "o" });
    const hypothesis = await store.addHypothesis(run.id, {
      statement: "monotonic clock removes skew",
    });
    expect(hypothesis.status).toBe("proposed");

    const testing = await store.updateHypothesis(hypothesis.id, {
      status: "testing",
    });
    expect(testing.status).toBe("testing");
    expect(await store.listHypotheses(run.id)).toHaveLength(1);
  });

  it("manages experiments and their runs", async () => {
    const run = await store.createRun({ projectId: "p1", objective: "o" });
    const spec = await store.createExperiment(run.id, {
      objective: "compare expiry accuracy",
      reference: { artifactId: "ref" },
      alternative: { artifactId: "alt" },
      procedure: ["insert", "sleep", "read"],
      measurements: ["expired"],
      repetitions: 5,
      acceptance: "agree on all runs",
    });
    expect(spec.investigationId).toBe(run.id);
    expect(await store.getExperiment(spec.id)).toEqual(spec);
    expect(await store.listExperiments(run.id)).toHaveLength(1);

    const expRun = await store.addExperimentRun(spec.id, {
      environment: { node: "v24" },
    });
    expect(expRun.status).toBe("pending");
    expect(expRun.rawValues).toEqual({});

    const done = await store.updateExperimentRun(expRun.id, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      rawValues: { expired: [1, 1, 1, 1, 1] },
    });
    expect(done.status).toBe("completed");
    expect(done.rawValues.expired).toHaveLength(5);
  });

  it("stores artifacts and conclusions", async () => {
    const run = await store.createRun({ projectId: "p1", objective: "o" });
    const artifact = await store.addArtifact(run.id, {
      kind: "implementation",
      path: "artifacts/alt/index.ts",
      description: "monotonic variant",
    });
    expect(artifact.kind).toBe("implementation");

    const conclusion = await store.addConclusion(run.id, {
      statement: "wall-clock is the skew source",
      evidenceIds: ["ev_1"],
      limitations: ["single machine"],
    });
    expect(conclusion.limitations).toEqual(["single machine"]);
    expect(await store.listConclusions(run.id)).toHaveLength(1);
  });

  it("writes atomically: valid JSON files, no tmp leftovers", async () => {
    const project = await store.createProject({ name: "p", objective: "o" });
    await store.createTarget({
      projectId: project.id,
      kind: "repo",
      ref: "r",
    });
    const run = await store.createRun({
      projectId: project.id,
      objective: "o",
    });
    await store.addEvidence(run.id, {
      type: "t",
      source: "s",
      observation: "o",
      limitations: [],
      verification: "observed",
      provenance: {},
    });

    const files = readdirSync(dir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, file), "utf8"));
      expect(Array.isArray(parsed)).toBe(true);
    }
  });

  it("persists across instances (same dataDir)", async () => {
    const project = await store.createProject({ name: "p", objective: "o" });
    const reopened = new FileStore({ dataDir: dir });
    expect(await reopened.getProject(project.id)).toEqual(project);
  });

  it("reads artifacts by id and lists them per investigation", async () => {
    const project = await store.createProject({ name: "p", objective: "o" });
    const run = await store.createRun({
      projectId: project.id,
      objective: "investigate",
    });
    const other = await store.createRun({
      projectId: project.id,
      objective: "other",
    });
    const artifact = await store.addArtifact(run.id, {
      kind: "implementation",
      path: "artifacts/x.js",
      description: "alt",
    });
    await store.addArtifact(other.id, {
      kind: "report",
      path: "artifacts/y.md",
      description: "rep",
    });
    expect(await store.getArtifact(artifact.id)).toEqual(artifact);
    expect(await store.getArtifact("nope")).toBeNull();
    const listed = await store.listArtifacts(run.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(artifact.id);
  });

  it("lists experiment runs per experiment", async () => {
    const project = await store.createProject({ name: "p", objective: "o" });
    const run = await store.createRun({
      projectId: project.id,
      objective: "investigate",
    });
    const spec = await store.createExperiment(run.id, {
      objective: "compare",
      reference: { artifactId: "ref" },
      procedure: ["run"],
      measurements: ["m"],
      repetitions: 1,
      acceptance: "ok",
    });
    const runA = await store.addExperimentRun(spec.id, {});
    await store.updateExperimentRun(runA.id, { status: "completed" });
    const runs = await store.listExperimentRuns(spec.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.id).toBe(runA.id);
    expect(await store.listExperimentRuns("nope")).toEqual([]);
  });
});

describe("SupabaseStore", () => {
  it("fails honestly on every method until configured", async () => {
    const store = new SupabaseStore();
    const calls: Promise<unknown>[] = [
      store.createProject({ name: "x", objective: "y" }),
      store.createTarget({ projectId: "p", kind: "repo", ref: "r" }),
      store.createRun({ projectId: "p", objective: "o" }),
      store.addStep("r", { title: "t" }),
      store.addEvidence("r", {
        type: "t",
        source: "s",
        observation: "o",
        limitations: [],
        verification: "observed",
        provenance: {},
      }),
      store.addFinding("r", { title: "t", body: "b", evidenceIds: [] }),
      store.addHypothesis("r", { statement: "s" }),
      store.createExperiment("r", {
        objective: "o",
        reference: { artifactId: "a" },
        procedure: [],
        measurements: [],
        repetitions: 1,
        acceptance: "a",
      }),
      store.addExperimentRun("e", {}),
      store.addArtifact("r", {
        kind: "report",
        path: "p",
        description: "d",
      }),
      store.addConclusion("r", {
        statement: "s",
        evidenceIds: [],
        limitations: [],
      }),
    ];
    for (const call of calls) {
      await expect(call).rejects.toThrow(/Supabase not configured/);
    }
  });
});
