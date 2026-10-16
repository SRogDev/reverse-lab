/**
 * Learning-oriented explanations — pure functions, no I/O.
 *
 * Every function is grounded ONLY in the data passed to it:
 * - claims cite evidence ids,
 * - cited-but-missing evidence is called out explicitly,
 * - empty inputs produce honest "nothing to say" text, never generic fluff.
 *
 * `explainLimitations` is always included alongside any other explanation —
 * the orchestrator and the demo append it to every summary.
 */

import type { MeasurementComparison } from "../experiments/runner";
import type { Evidence, ExperimentSpec, Finding } from "../types";

function head(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Describe a target's architecture strictly from the evidence records.
 */
export function explainArchitecture(input: {
  targetRef: string;
  evidence: Evidence[];
}): string {
  const { targetRef, evidence } = input;
  if (evidence.length === 0) {
    return (
      `No evidence was collected for ${targetRef}; nothing can be said ` +
      `about its architecture. Run an inspection capability first.`
    );
  }
  const lines = [
    `Architecture of ${targetRef} — reconstructed from ${evidence.length} evidence record(s).`,
  ];
  for (const e of evidence) {
    lines.push(
      `- Evidence ${e.id} (${e.type}, verification=${e.verification}) reports: ${head(e.observation)}`,
    );
    if (e.limitations.length > 0) {
      lines.push(`  Limitations: ${e.limitations.join("; ")}`);
    }
  }
  lines.push(
    "Anything not cited above is not established by this investigation.",
  );
  return lines.join("\n");
}

/**
 * Explain one finding: its status, its body, and exactly which cited
 * evidence exists (or is missing).
 */
export function explainFinding(input: {
  finding: Finding;
  evidence: Evidence[];
}): string {
  const { finding, evidence } = input;
  const lines = [
    `Finding ${finding.id} [${finding.status}]: ${finding.title}`,
    head(finding.body, 500),
  ];
  if (finding.evidenceIds.length === 0) {
    lines.push("This finding cites no evidence.");
    return lines.join("\n");
  }
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const present: string[] = [];
  const missing: string[] = [];
  for (const id of finding.evidenceIds) {
    if (byId.has(id)) {
      present.push(id);
    } else {
      missing.push(id);
    }
  }
  if (present.length > 0) {
    lines.push(
      `Cites ${present.length} evidence record(s) present in the store: ${present.join(", ")}.`,
    );
    for (const id of present) {
      const e = byId.get(id);
      if (e) {
        lines.push(`- ${id} (${e.type}): ${head(e.observation)}`);
      }
    }
  }
  for (const id of missing) {
    lines.push(
      `WARNING: evidence ${id} cited by this finding was not found in the ` +
        `investigation store — the citation cannot be checked.`,
    );
  }
  return lines.join("\n");
}

/**
 * Explain an experiment: the spec, the raw per-measurement stats, and the
 * failures. Never derives a verdict — the numbers are the result.
 */
export function explainExperiment(input: {
  spec: ExperimentSpec;
  comparisons: MeasurementComparison[];
  failures: string[];
}): string {
  const { spec, comparisons, failures } = input;
  const lines = [
    `Experiment: ${spec.objective}`,
    `Procedure (${spec.procedure.length} steps, ${spec.repetitions} repetitions):`,
    ...spec.procedure.map((p, i) => `  ${i + 1}. ${p}`),
    `Acceptance: ${spec.acceptance}`,
  ];
  if (comparisons.length === 0) {
    lines.push("No measurements were collected for this experiment.");
  } else {
    lines.push("Measurements (raw stats, no composite scores):");
    for (const c of comparisons) {
      const ref = c.reference;
      let line = `- ${c.measurement}: reference n=${ref.n} mean=${ref.mean} min=${ref.min} max=${ref.max}`;
      if (c.alternative) {
        const alt = c.alternative;
        line +=
          `; alternative n=${alt.n} mean=${alt.mean} min=${alt.min} max=${alt.max}` +
          `; delta vs reference=${c.deltaVsReference}`;
      } else {
        line += "; no alternative measurements";
      }
      lines.push(line);
    }
  }
  if (failures.length > 0) {
    lines.push(`Failures (${failures.length}):`);
    for (const f of failures) {
      lines.push(`- ${f}`);
    }
  }
  lines.push(
    "No verdict is derived here — the numbers above are the result. " +
      "Interpretation belongs to the operator.",
  );
  return lines.join("\n");
}

/**
 * Always included: the known limitations and the explicitly unverified
 * items. Empty inputs are reported as "none recorded", never padded.
 */
export function explainLimitations(input: {
  limitations: string[];
  unverified: string[];
}): string {
  const { limitations, unverified } = input;
  const lines = ["Limitations:"];
  if (limitations.length === 0 && unverified.length === 0) {
    lines.push("- No limitations were recorded for this investigation.");
  }
  for (const l of limitations) {
    lines.push(`- ${l}`);
  }
  if (unverified.length > 0) {
    lines.push("Explicitly unverified:");
    for (const u of unverified) {
      lines.push(`- UNVERIFIED: ${u}`);
    }
  }
  lines.push(
    "These limitations apply to every conclusion drawn from this data.",
  );
  return lines.join("\n");
}
