/**
 * LLM code generation — contract-first free-form TypeScript synthesis.
 *
 * This is the second codegen path, next to the deterministic template
 * transforms in `codegen.ts` (which are unchanged). Where the template
 * path emits one reviewed source, this module asks a real model provider
 * to synthesize an alternative implementation — as a first-class
 * capability of the single investigation orchestrator (the plan's §5
 * stages are responsibilities of one orchestrator, not separate agents).
 *
 * The contract comes FIRST (plan §8 / PROJECT_BRIEF §4.6): before any
 * generation, the caller fixes the behavior to preserve, the objective,
 * the constraints, the required tests, the evaluation procedure, and the
 * target contract the alternative must satisfy. Generation without that
 * contract is not offered.
 *
 * The loop (bounded by MAX_GENERATION_ATTEMPTS):
 * 1. Prompt the ModelProvider with the contract (+ the previous attempt's
 *    failing compiler/test output on repairs).
 * 2. Extract exactly one TypeScript source from the response: the FIRST
 *    fenced code block (```ts / ```typescript / bare ```). That fence
 *    extraction is the only permitted cleanup — an unfenced or empty
 *    response is a failed attempt, never silently repaired.
 * 3. Write the source into the Executor sandbox (artifacts root) and run
 *    `tsc --noEmit --strict` through the Executor.
 * 4. Emit CommonJS and run the contract's probe tests through the
 *    Executor: `node <probeFile> <compiledJsPath>`; each probe must exit 0.
 * 5. On success, register an `implementation` Artifact linked to the
 *    hypothesis, with evidence recording the provider/model, the attempts
 *    used, every failed attempt's stage and error, the tsc result, and
 *    the probe results. On exhaustion, return an explicit failure (and
 *    record it as evidence) — no artifact is registered as a success.
 *
 * Provider honesty: synthesis requires a real model. The deterministic
 * ScriptedModelProvider can never synthesize — this module returns an
 * `unavailable` result WITHOUT calling the provider or writing any file,
 * rather than routing canned text into codegen and calling it generated
 * code. The AIGatewayProvider keeps its own honest not-configured error;
 * surfacing through the attempt loop as a `provider`-stage failure.
 *
 * Safety: generated code is untrusted. It is only ever written through
 * the Executor (which refuses paths outside its sandbox root) and only
 * ever executed by Executor child processes — never imported, required,
 * or evaluated in the lab process.
 *
 * UNVERIFIED: real-model synthesis quality. No live model run has been
 * performed in this environment (no AI Gateway key); every behavioral
 * test uses a fake provider through the ModelProvider seam.
 */

import { join } from "node:path";
import type { Store } from "../evidence/store";
import type { Executor } from "../execution/executor";
import {
  canSynthesize,
  type ModelProvider,
} from "../investigation-engine/model";
import { type Artifact, generateId, nowIso } from "../types.ts";

/** Hard bound on generation attempts per synthesis (initial + repairs). */
export const MAX_GENERATION_ATTEMPTS = 3;

/**
 * An executable probe test shipped by the contract. The source is plain
 * JavaScript run inside the executor as `node <probeFile> <implJsPath>` —
 * `process.argv[2]` is the compiled implementation path. Exit 0 = pass.
 */
export interface CodegenProbe {
  name: string;
  source: string;
}

/**
 * The §8 contract, fixed BEFORE generation: what the alternative must
 * preserve, what it must improve, and how it will be judged.
 */
export interface CodegenContract {
  behaviorToPreserve: string;
  objective: string;
  constraints: string[];
  requiredTests: CodegenProbe[];
  evaluationProcedure: string;
  /** TypeScript contract (interface/signatures) the module must satisfy. */
  targetContract: string;
  hypothesisId?: string;
}

export interface LlmCodegenDeps {
  store: Store;
  executor: Executor;
  /** Sandbox directory where `<artifactId>.ts` / `.js` + probes are written. */
  artifactsRoot: string;
  /** Absolute path to the TypeScript compiler (typescript/lib/tsc.js). */
  tscBin: string;
  /** The model provider to synthesize with (must be a real model). */
  provider: ModelProvider;
}

export interface AttemptRecord {
  attempt: number;
  /** Stage that decided the attempt: extract | tsc | probes | provider. */
  stage: "extract" | "tsc" | "probes" | "provider";
  /** Error excerpt for failed attempts; "ok" for the successful one. */
  detail: string;
}

export type LlmCodegenResult =
  | { status: "generated"; artifact: Artifact; attempts: number }
  | { status: "unavailable"; reason: string }
  | {
      status: "failed";
      attempts: number;
      lastError: string;
      attemptLog: AttemptRecord[];
    };

const UNAVAILABLE_REASON =
  "LLM synthesis unavailable: the active model provider is deterministic " +
  "(scripted) or missing — canned output is not generated code. Configure " +
  "a real model provider (AI Gateway: AI_GATEWAY_API_KEY + AI_GATEWAY_MODEL) " +
  "to use codegen-llm-typescript.";

function truncate(text: string, max = 2000): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/** Build the generation prompt from the contract (attempt 1). */
function buildPrompt(contract: CodegenContract): string {
  const lines: string[] = [
    "You are the code generation capability of Reverse Lab, an engineering",
    "investigation laboratory. Synthesize ONE alternative TypeScript",
    "implementation under the contract below. The contract was fixed",
    "before generation and is not negotiable.",
    "",
    `BEHAVIOR TO PRESERVE: ${contract.behaviorToPreserve}`,
    `OBJECTIVE: ${contract.objective}`,
    "CONSTRAINTS:",
    ...contract.constraints.map((c) => `- ${c}`),
    "",
    "TARGET CONTRACT (the module must satisfy this):",
    contract.targetContract,
    "",
    `EVALUATION PROCEDURE: ${contract.evaluationProcedure}`,
  ];
  if (contract.requiredTests.length > 0) {
    lines.push(
      "",
      "REQUIRED PROBE TESTS (run against the compiled module; the probe",
      "receives the compiled file path as process.argv[2]):",
    );
    for (const probe of contract.requiredTests) {
      lines.push(`--- probe "${probe.name}" ---`, probe.source);
    }
  }
  lines.push(
    "",
    "OUTPUT FORMAT (strict): respond with EXACTLY ONE fenced code block",
    "tagged ```ts containing the complete TypeScript source of a single",
    "self-contained module (no imports). No prose outside the fence.",
  );
  return lines.join("\n");
}

/** Build the repair prompt: contract prompt + what failed last time. */
function buildRepairPrompt(
  contract: CodegenContract,
  previousSource: string,
  failure: AttemptRecord,
): string {
  return [
    buildPrompt(contract),
    "",
    `REPAIR: attempt ${failure.attempt} failed at stage "${failure.stage}".`,
    "Compiler/test output:",
    truncate(failure.detail),
    "",
    "Previous source (fix it; keep the same target contract):",
    "```ts",
    previousSource,
    "```",
  ].join("\n");
}

const FENCE_RE = /```(?:ts|typescript)?[ \t]*\r?\n([\s\S]*?)```/;

/**
 * Extract the single TypeScript source from a model response: the first
 * fenced block. Returns null when there is no usable fence — the only
 * cleanup permitted; anything else would be silent repair.
 */
export function extractTypeScriptSource(response: string): string | null {
  const match = FENCE_RE.exec(response);
  if (!match) {
    return null;
  }
  const source = (match[1] ?? "").trim();
  if (source === "" || source.includes("```")) {
    return null;
  }
  return source;
}

interface ProbeOutcome {
  name: string;
  exitCode: number;
  detail: string;
}

/** Run one attempt's verification: tsc --noEmit, emit, probes. */
async function verifyAttempt(
  deps: LlmCodegenDeps,
  artifactId: string,
  tsPath: string,
  jsPath: string,
  contract: CodegenContract,
): Promise<
  | { ok: true; probes: ProbeOutcome[] }
  | { ok: false; failure: Omit<AttemptRecord, "attempt"> }
> {
  // Same guard as the template path: the generated file is self-contained,
  // so point typeRoots at an empty dir or tsc auto-includes the repo's
  // @types from the executor cwd and fails on unrelated packages. The dir
  // is created by writing a placeholder through the executor.
  const emptyTypeRootsRel = ".empty-typeroots";
  await deps.executor.writeFiles(deps.artifactsRoot, {
    [`${emptyTypeRootsRel}/.keep`]: "",
  });
  const emptyTypeRoots = join(deps.artifactsRoot, emptyTypeRootsRel);
  const typeArgs = ["--typeRoots", emptyTypeRoots];

  const check = await deps.executor.run(
    "node",
    [
      deps.tscBin,
      "--noEmit",
      "--strict",
      "--target",
      "es2022",
      ...typeArgs,
      tsPath,
    ],
    { cwd: ".", timeoutMs: 120_000 },
  );
  if (check.exitCode !== 0) {
    return {
      ok: false,
      failure: {
        stage: "tsc",
        detail: truncate(
          `tsc --noEmit --strict failed (exit ${check.exitCode}):\n${check.stderr || check.stdout}`,
        ),
      },
    };
  }

  const emit = await deps.executor.run(
    "node",
    [
      deps.tscBin,
      "--strict",
      "--target",
      "es2022",
      "--module",
      "commonjs",
      "--noEmitOnError",
      ...typeArgs,
      "--outDir",
      deps.artifactsRoot,
      tsPath,
    ],
    { cwd: ".", timeoutMs: 120_000 },
  );
  if (emit.exitCode !== 0) {
    return {
      ok: false,
      failure: {
        stage: "tsc",
        detail: truncate(
          `tsc emit failed (exit ${emit.exitCode}):\n${emit.stderr || emit.stdout}`,
        ),
      },
    };
  }

  const probes: ProbeOutcome[] = [];
  for (const [index, probe] of contract.requiredTests.entries()) {
    const probeName = `probe-${artifactId}-${index}.js`;
    await deps.executor.writeFiles(deps.artifactsRoot, {
      [probeName]: probe.source,
    });
    const probePath = join(deps.artifactsRoot, probeName);
    const run = await deps.executor.run("node", [probePath, jsPath], {
      cwd: ".",
      timeoutMs: 60_000,
    });
    probes.push({
      name: probe.name,
      exitCode: run.exitCode,
      detail: truncate(
        `exit ${run.exitCode}${run.timedOut ? " (timed out)" : ""}\n${run.stdout}\n${run.stderr}`,
      ),
    });
    if (run.exitCode !== 0) {
      return {
        ok: false,
        failure: {
          stage: "probes",
          detail: `probe "${probe.name}" failed: ${probes[probes.length - 1]?.detail ?? ""}`,
        },
      };
    }
  }
  return { ok: true, probes };
}

const SYNTHESIS_LIMITATIONS = [
  "Free-form LLM synthesis: behavioral equivalence beyond the contract's " +
    "probe tests is UNVERIFIED.",
  "Real-model synthesis quality is UNVERIFIED in this environment: no live " +
    "model run has been performed (no AI Gateway key); behavioral tests " +
    "use a fake provider through the ModelProvider seam.",
];

/**
 * Synthesize an alternative implementation under a §8 contract.
 * See the module docstring for the loop, the honesty rules, and the
 * safety boundary. Never throws for expected failures — the result union
 * carries them explicitly.
 */
export async function generateSynthesizedAlternative(
  deps: LlmCodegenDeps,
  investigationId: string,
  referenceArtifactId: string,
  contract: CodegenContract,
): Promise<LlmCodegenResult> {
  if (!canSynthesize(deps.provider)) {
    // Never call the deterministic provider, never write a file: canned
    // text presented as generated code would be a fabrication.
    return { status: "unavailable", reason: UNAVAILABLE_REASON };
  }

  const artifactId = generateId();
  const tsPath = join(deps.artifactsRoot, `${artifactId}.ts`);
  const jsPath = join(deps.artifactsRoot, `${artifactId}.js`);
  const attemptLog: AttemptRecord[] = [];
  let lastSource = "";
  let lastFailure: AttemptRecord | null = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const prompt =
      attempt === 1 || lastFailure === null
        ? buildPrompt(contract)
        : buildRepairPrompt(contract, lastSource, lastFailure);

    let response: string;
    try {
      response = await deps.provider.complete(prompt);
    } catch (err) {
      const detail = truncate(err instanceof Error ? err.message : String(err));
      lastFailure = { attempt, stage: "provider", detail };
      attemptLog.push(lastFailure);
      continue;
    }

    const source = extractTypeScriptSource(response);
    if (source === null) {
      lastFailure = {
        attempt,
        stage: "extract",
        detail:
          "model response contained no usable fenced TypeScript block " +
          "(extraction failed; no silent repair is attempted)",
      };
      attemptLog.push(lastFailure);
      continue;
    }
    lastSource = source;

    await deps.executor.writeFiles(deps.artifactsRoot, {
      [`${artifactId}.ts`]: `${source}\n`,
    });

    const verification = await verifyAttempt(
      deps,
      artifactId,
      tsPath,
      jsPath,
      contract,
    );
    if (!verification.ok) {
      lastFailure = { attempt, ...verification.failure };
      attemptLog.push(lastFailure);
      continue;
    }

    // Success: register the artifact exactly like the template path does,
    // then record the full synthesis evidence.
    const probes = verification.probes;
    const description =
      `Alternative implementation (LLM synthesis via ` +
      `${deps.provider.providerLabel}) for reference artifact ` +
      `${referenceArtifactId}. Objective: ${contract.objective}. ` +
      `tsc --strict clean; probes ${probes.filter((p) => p.exitCode === 0).length}/${probes.length} passed; ` +
      `generated on attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}.` +
      (contract.hypothesisId
        ? ` Tests hypothesis ${contract.hypothesisId}.`
        : "");
    const artifact = await deps.store.addArtifact(investigationId, {
      kind: "implementation",
      path: jsPath,
      description,
    });
    const modelId = (deps.provider as { modelId?: unknown }).modelId ?? null;
    await deps.store.addEvidence(investigationId, {
      type: "codegen:llm-typescript",
      source: `reverse-lab llm codegen (${deps.provider.providerLabel})`,
      observation: JSON.stringify({
        status: "generated",
        artifactId: artifact.id,
        referenceArtifactId,
        hypothesisId: contract.hypothesisId ?? null,
        provider: deps.provider.providerLabel,
        modelId,
        attempts: attempt,
        attemptLog,
        tsc: "pass (tsc --noEmit --strict, then CommonJS emit)",
        probes: probes.map((p) => ({ name: p.name, exitCode: p.exitCode })),
        contract: {
          behaviorToPreserve: contract.behaviorToPreserve,
          objective: contract.objective,
          constraints: contract.constraints,
          evaluationProcedure: contract.evaluationProcedure,
          targetContract: contract.targetContract,
        },
        generatedAt: nowIso(),
        tsSource: tsPath,
      }),
      limitations: [...SYNTHESIS_LIMITATIONS],
      verification: "observed",
      provenance: {
        generator: "reverse-lab llm codegen",
        provider: deps.provider.providerLabel,
        attempts: attempt,
        maxAttempts: MAX_GENERATION_ATTEMPTS,
      },
    });
    return { status: "generated", artifact, attempts: attempt };
  }

  const lastError =
    lastFailure?.detail ?? "synthesis failed without a recorded attempt";
  // Exhaustion is explicit: the failure is recorded as evidence and
  // returned; NO artifact is registered.
  await deps.store.addEvidence(investigationId, {
    type: "codegen:llm-typescript",
    source: `reverse-lab llm codegen (${deps.provider.providerLabel})`,
    observation: JSON.stringify({
      status: "failed",
      referenceArtifactId,
      hypothesisId: contract.hypothesisId ?? null,
      provider: deps.provider.providerLabel,
      attempts: MAX_GENERATION_ATTEMPTS,
      attemptLog,
      lastError,
    }),
    limitations: [...SYNTHESIS_LIMITATIONS],
    verification: "observed",
    provenance: {
      generator: "reverse-lab llm codegen",
      provider: deps.provider.providerLabel,
      attempts: MAX_GENERATION_ATTEMPTS,
      maxAttempts: MAX_GENERATION_ATTEMPTS,
      outcome: "failed",
    },
  });
  return {
    status: "failed",
    attempts: MAX_GENERATION_ATTEMPTS,
    lastError,
    attemptLog,
  };
}
