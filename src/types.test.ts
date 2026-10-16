import { describe, expect, it } from "vitest";
import {
  type Artifact,
  type Conclusion,
  type Evidence,
  type ExperimentRun,
  type ExperimentSpec,
  type Finding,
  generateId,
  type Hypothesis,
  type InvestigationRun,
  isLabEvidenceId,
  isReaEvidenceId,
  labEvidenceId,
  nowIso,
  type PlanStep,
  type Project,
  type ResearchTarget,
  type RunStatus,
} from "./types";

describe("id and timestamp helpers", () => {
  it("generateId returns unique uuid-shaped ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it("nowIso returns a parseable ISO-8601 timestamp", () => {
    const ts = nowIso();
    expect(Number.isNaN(Date.parse(ts))).toBe(false);
    expect(ts).toBe(new Date(ts).toISOString());
  });
});

describe("evidence id conventions", () => {
  it("accepts well-formed REA evidence ids", () => {
    expect(isReaEvidenceId(`ev_${"a".repeat(64)}`)).toBe(true);
    expect(isReaEvidenceId(`ev_${"0".repeat(64)}`)).toBe(true);
  });

  it("rejects malformed REA evidence ids", () => {
    expect(isReaEvidenceId("ev_short")).toBe(false);
    expect(isReaEvidenceId(`ev_${"g".repeat(64)}`)).toBe(false); // not hex
    expect(isReaEvidenceId(`lab-ev-${"a".repeat(64)}`)).toBe(false);
    expect(isReaEvidenceId("")).toBe(false);
  });

  it("labEvidenceId is deterministic and content-addressed", () => {
    const a = labEvidenceId('{"claim":"x"}');
    const b = labEvidenceId('{"claim":"x"}');
    const c = labEvidenceId('{"claim":"y"}');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(isLabEvidenceId(a)).toBe(true);
    expect(a).toMatch(/^lab-ev-[0-9a-f]{64}$/);
  });
});

describe("domain contract shapes", () => {
  it("constructs every domain object per the contract", () => {
    const project: Project = {
      id: generateId(),
      name: "mini-kv",
      objective: "understand TTL expiry semantics",
      constraints: ["no network"],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const target: ResearchTarget = {
      id: generateId(),
      projectId: project.id,
      kind: "component",
      ref: "samples/mini-kv",
      createdAt: nowIso(),
    };

    const statuses: RunStatus[] = [
      "pending",
      "running",
      "completed",
      "failed",
      "blocked",
      "needs-evaluation",
      "provisional",
    ];
    expect(statuses).toHaveLength(7);

    const step: PlanStep = {
      id: generateId(),
      title: "inspect target",
      status: "pending",
    };

    const run: InvestigationRun = {
      id: generateId(),
      projectId: project.id,
      objective: project.objective,
      status: "pending",
      plan: [step],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const evidence: Evidence = {
      id: `ev_${"b".repeat(64)}`,
      type: "rea:analyze-javascript-application",
      source: "rea-agents/analyze-javascript-application",
      observation: '{"modules": 3}',
      limitations: ["static analysis only; no runtime behavior observed"],
      verification: "observed",
      provenance: { tool: "analyze-javascript-application" },
      createdAt: nowIso(),
    };

    const finding: Finding = {
      id: generateId(),
      investigationId: run.id,
      title: "TTL uses wall-clock",
      body: "expiry compares Date.now() against stored deadline",
      evidenceIds: [evidence.id],
      status: "provisional",
    };

    const hypothesis: Hypothesis = {
      id: generateId(),
      investigationId: run.id,
      statement: "replacing Date.now with a monotonic clock removes skew",
      status: "proposed",
      evidenceIds: [],
    };

    const spec: ExperimentSpec = {
      id: generateId(),
      investigationId: run.id,
      objective: "compare expiry accuracy",
      hypothesisId: hypothesis.id,
      reference: { artifactId: "ref-impl" },
      procedure: ["insert with ttl=1000", "sleep 1100", "read"],
      measurements: ["expired:boolean"],
      repetitions: 5,
      acceptance: "reference and alternative agree on all runs",
    };

    const expRun: ExperimentRun = {
      id: generateId(),
      experimentId: spec.id,
      status: "completed",
      startedAt: nowIso(),
      finishedAt: nowIso(),
      environment: { node: "v24.20.0" },
      rawValues: { expired: [1, 1, 1, 1, 1] },
      failures: [],
    };

    const artifact: Artifact = {
      id: generateId(),
      investigationId: run.id,
      kind: "implementation",
      path: "artifacts/mini-kv-alt/index.ts",
      description: "monotonic-clock TTL variant",
      createdAt: nowIso(),
    };

    const conclusion: Conclusion = {
      id: generateId(),
      investigationId: run.id,
      statement: "wall-clock TTL is the dominant skew source",
      evidenceIds: [evidence.id],
      limitations: ["single-machine measurement"],
    };

    // Every conclusion references its evidence — architecture invariant.
    for (const eid of conclusion.evidenceIds) {
      expect(eid).toBe(evidence.id);
    }
    expect(finding.status).toBe("provisional");
    expect(target.projectId).toBe(project.id);
    expect(expRun.rawValues.expired).toHaveLength(5);
    expect(artifact.kind).toBe("implementation");
  });
});
