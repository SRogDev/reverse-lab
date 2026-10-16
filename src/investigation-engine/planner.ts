/**
 * Deterministic investigation planner (MVP).
 *
 * No LLM is consulted: `planObjective` detects target-kind hints and intent
 * keywords in the objective, selects registry capabilities, and emits a
 * structured plan. The plan is a starting point — the orchestrator revises
 * it as real evidence arrives (`revisePlan`), and the operator can append
 * steps (`continueInvestigation`).
 *
 * Intent detection is deliberately conservative: it is better to under-plan
 * (the operator revises) than to hallucinate an ambitious plan the lab
 * cannot execute.
 */

import { getCapability } from "../capabilities/registry";
import { generateId, type PlanStep, type ResearchTarget } from "../types";

export interface InvestigationPlan {
  steps: PlanStep[];
  questions: string[];
  expectedEvidence: string[];
  evaluationCriteria: string[];
  constraints: string[];
  limitations: string[];
}

interface DetectedIntent {
  /** (capabilityId, targetRef) inspection steps, in target order. */
  inspections: Array<{ capabilityId: string; targetRef: string }>;
  wantsAlternative: boolean;
  wantsExperiment: boolean;
  nativeUnavailable: boolean;
}

const SQLITE_RE = /\.(sqlite|sqlite3|db)\b/i;
const NATIVE_BINARY_RE = /\.(dll|so|dylib|exe|bin|o|a|dmg)\b/i;
const NATIVE_WORDS_RE = /\bnative binary\b|\bmachine code\b/i;
const SQLITE_WORDS_RE = /\bsqlite\b|\bdatabase schema\b|\bdb file\b/i;
const ALTERNATIVE_RE =
  /\balternative\b|\bvariant\b|\bsimpler\b|\brewrite\b|\brebuild\b|\breimplement\b/i;
const EXPERIMENT_RE =
  /\bexperiment\b|\bbenchmark\b|\bcompar(?:e|ison)\b|\bmeasure\b|\bvalidate\b|\btest\b.*\bhypothesis\b/i;

function detect(objective: string, targets: ResearchTarget[]): DetectedIntent {
  const text =
    `${objective} ${targets.map((t) => `${t.kind} ${t.ref}`).join(" ")}`.toLowerCase();
  const inspections: DetectedIntent["inspections"] = [];
  let nativeUnavailable = false;

  for (const target of targets) {
    const ref = target.ref;
    if (SQLITE_RE.test(ref) || SQLITE_WORDS_RE.test(text)) {
      inspections.push({ capabilityId: "rea-sqlite", targetRef: ref });
    } else if (NATIVE_BINARY_RE.test(ref) || NATIVE_WORDS_RE.test(text)) {
      inspections.push({ capabilityId: "rea-native", targetRef: ref });
      nativeUnavailable = true;
    } else {
      // Default for repo/component targets in the MVP: JS/TS static analysis.
      inspections.push({ capabilityId: "rea-javascript-app", targetRef: ref });
    }
  }
  if (NATIVE_WORDS_RE.test(text)) {
    nativeUnavailable = true;
  }

  const wantsAlternative = ALTERNATIVE_RE.test(text);
  // An alternative is only meaningful when compared: it implies an experiment.
  const wantsExperiment = EXPERIMENT_RE.test(text) || wantsAlternative;

  return { inspections, wantsAlternative, wantsExperiment, nativeUnavailable };
}

/** Pull "the X implementation" out of the objective for targeted questions. */
export function mechanismWord(objective: string): string {
  const match = /the\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\s+implementation/i.exec(
    objective,
  );
  return match?.[1] ?? "core mechanism";
}

function step(title: string, detail: string): PlanStep {
  return { id: generateId(), title, status: "pending", detail };
}

export function planObjective(
  objective: string,
  targets: ResearchTarget[],
): InvestigationPlan {
  const intent = detect(objective, targets);
  const steps: PlanStep[] = [];
  const expectedEvidence: string[] = [];

  for (const { capabilityId, targetRef } of intent.inspections) {
    const cap = getCapability(capabilityId);
    const unavailable =
      capabilityId === "rea-native"
        ? " [UNAVAILABLE: needs-configuration]"
        : "";
    steps.push(
      step(
        `Inspect target with ${capabilityId}: ${targetRef}${unavailable}`,
        `capability=${capabilityId}; target=${targetRef}; ` +
          `purpose=${cap?.purpose ?? "unknown"}`,
      ),
    );
    if (cap) {
      expectedEvidence.push(cap.evidenceKind);
    }
  }

  steps.push(
    step(
      "Ingest REA evidence into the store",
      "internal: map each REA record via reaEvidenceToLabEvidence; " +
        "deduplicate on content-addressed evidence_id; keep limitations[] verbatim",
    ),
  );
  steps.push(
    step(
      "Form hypotheses (recorded as hypotheses, never facts)",
      "internal: hypotheses cite supporting evidence ids; status starts at 'proposed'",
    ),
  );
  steps.push(
    step(
      "Identify implementation opportunities",
      "internal: opportunities become provisional findings linked to evidence",
    ),
  );

  if (intent.wantsExperiment) {
    steps.push(
      step(
        "Design experiment: procedure, measurements, repetitions, acceptance",
        "internal: ExperimentSpec with reference artifact; alternative when one is generated",
      ),
    );
    expectedEvidence.push("experiment:run");
  }
  if (intent.wantsAlternative) {
    steps.push(
      step(
        "Generate alternative implementation (codegen-typescript)",
        "capability=codegen-typescript; deterministic transform, tsc typecheck in sandbox; " +
          "stored as Artifact linked to the hypothesis",
      ),
    );
    expectedEvidence.push("codegen:typescript");
  }
  if (intent.wantsExperiment) {
    steps.push(
      step(
        "Run experiment in the sandbox executor (experiment-run)",
        "capability=experiment-run; fresh sandbox cwd per run; raw measurements + full environment context; " +
          "failures recorded, never hidden",
      ),
    );
  }

  steps.push(
    step(
      "Record findings and conclusions",
      "internal: findings cite evidence ids; conclusions carry limitations[]; " +
        "hypotheses stay hypotheses until an experiment supports or refutes them",
    ),
  );

  const mechanism = mechanismWord(objective);
  const questions = [
    `What is the architecture of the target — entry points, modules, dependencies?`,
    `What mechanism implements ${mechanism}, and what are its trade-offs?`,
    `Which observations are real measurements and which are unverified assumptions?`,
  ];
  if (intent.wantsAlternative) {
    questions.push(
      `What is the simplest alternative to ${mechanism} that preserves observable behavior?`,
    );
  }
  if (intent.wantsExperiment) {
    questions.push(
      "How can the alternative be compared against the reference with real measurements?",
    );
  }

  const evaluationCriteria = [
    "Every finding cites at least one evidence id and starts provisional",
    "Hypotheses are recorded as hypotheses, never presented as facts",
    "The alternative compiles with tsc and passes the reference procedure before any comparison",
    "The experiment reports raw measurements with full environment context — no composite scores",
    "Failed, blocked, or inconclusive steps stay visible as failed/blocked — never converted into successes",
  ];

  const constraints = [
    "No invented capabilities, results, or infrastructure limits — UNVERIFIED stays labeled",
    "Untrusted code executes only inside the sandbox executor, never in the lab process",
  ];
  if (intent.nativeUnavailable) {
    constraints.push(
      "rea-native is needs-configuration (no native analysis engine installed): " +
        "plan around static/zero-engine evidence only",
    );
  }

  const limitations = [
    "MVP planner is deterministic and keyword-based: it selects capabilities, " +
      "it does not judge relevance or novelty. The orchestrator revises the plan as evidence arrives.",
    "No LLM is consulted in the MVP; adaptive reasoning arrives with the AI Gateway model provider.",
  ];
  if (intent.nativeUnavailable) {
    limitations.push(
      "No native analysis engine is installed (rea doctor scope check fails): " +
        "native-binary questions cannot be answered in this environment.",
    );
  }

  return {
    steps,
    questions,
    expectedEvidence,
    evaluationCriteria,
    constraints,
    limitations,
  };
}
