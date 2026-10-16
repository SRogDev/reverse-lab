/**
 * Explanation tests — pure functions grounded ONLY in the data passed in.
 *
 * Every explanation must cite the evidence ids it rests on, say explicitly
 * when cited evidence is missing, and produce honest "nothing to say" text
 * for empty inputs instead of generic fluff.
 */
import { describe, expect, it } from "vitest";
import type { MeasurementComparison } from "../experiments/runner";
import type { Evidence, ExperimentSpec, Finding } from "../types";
import {
  explainArchitecture,
  explainExperiment,
  explainFinding,
  explainLimitations,
} from "./explain";

const EVIDENCE: Evidence[] = [
  {
    id: "ev_abc",
    type: "rea:analyze_javascript_application",
    source: "rea-agents@6.5.0",
    observation: JSON.stringify({ entryPoints: ["src/index.ts"] }),
    limitations: ["static analysis only"],
    verification: "observed",
    provenance: {},
    createdAt: "2026-10-16T00:00:00.000Z",
  },
];

const FINDING: Finding = {
  id: "finding-1",
  investigationId: "run-1",
  title: "Opportunity: simpler TTL implementation",
  body: "Provisional: the TTL mechanism may be simplifiable.",
  evidenceIds: ["ev_abc"],
  status: "provisional",
};

describe("explainArchitecture", () => {
  it("cites every evidence id it rests on", () => {
    const text = explainArchitecture({
      targetRef: "samples/mini-kv",
      evidence: EVIDENCE,
    });
    expect(text).toContain("samples/mini-kv");
    expect(text).toContain("ev_abc");
    expect(text).toContain("rea:analyze_javascript_application");
    expect(text).toContain("static analysis only");
  });

  it("says honestly when there is no evidence", () => {
    const text = explainArchitecture({ targetRef: "x", evidence: [] });
    expect(text).toMatch(/no evidence/i);
    expect(text).not.toMatch(/entryPoints/);
  });
});

describe("explainFinding", () => {
  it("grounds the finding in its cited evidence", () => {
    const text = explainFinding({ finding: FINDING, evidence: EVIDENCE });
    expect(text).toContain("finding-1");
    expect(text).toContain("ev_abc");
    expect(text).toContain("provisional");
  });

  it("warns when cited evidence is missing from the store", () => {
    const text = explainFinding({
      finding: { ...FINDING, evidenceIds: ["ev_missing"] },
      evidence: EVIDENCE,
    });
    expect(text).toMatch(/ev_missing/);
    expect(text).toMatch(/not found|cannot be checked/i);
  });

  it("says so when the finding cites no evidence", () => {
    const text = explainFinding({
      finding: { ...FINDING, evidenceIds: [] },
      evidence: EVIDENCE,
    });
    expect(text).toMatch(/cites no evidence/i);
  });
});

describe("explainExperiment", () => {
  const spec = {
    id: "exp-1",
    objective: "compare kv variants",
    procedure: ["run harness"],
    measurements: ["wall_time_ms"],
    repetitions: 5,
    acceptance: "report raw numbers",
  } as ExperimentSpec;
  const comparisons: MeasurementComparison[] = [
    {
      measurement: "wall_time_ms",
      reference: { n: 5, mean: 20, min: 10, max: 30 },
      alternative: { n: 5, mean: 10, min: 5, max: 15 },
      deltaVsReference: -10,
    },
  ];

  it("reports the numbers and refuses to invent a verdict", () => {
    const text = explainExperiment({ spec, comparisons, failures: [] });
    expect(text).toContain("wall_time_ms");
    expect(text).toContain("20");
    expect(text).toContain("-10");
    expect(text).toMatch(/no verdict/i);
  });

  it("lists failures instead of hiding them", () => {
    const text = explainExperiment({
      spec,
      comparisons: [],
      failures: ["alternative repetition 3: harness timed out"],
    });
    expect(text).toContain("harness timed out");
  });

  it("is honest when no measurements were collected", () => {
    const text = explainExperiment({ spec, comparisons: [], failures: [] });
    expect(text).toMatch(/no measurements/i);
  });
});

describe("explainLimitations", () => {
  it("always includes the limitations and the unverified items", () => {
    const text = explainLimitations({
      limitations: ["wall-clock noise"],
      unverified: ["behavioral equivalence beyond the procedure"],
    });
    expect(text).toContain("wall-clock noise");
    expect(text).toContain("behavioral equivalence");
  });

  it("says so when nothing is known to be limited", () => {
    const text = explainLimitations({ limitations: [], unverified: [] });
    expect(text).toMatch(/no limitations were recorded/i);
  });
});
