/**
 * LLM codegen tests — contract-first free-form TypeScript synthesis.
 *
 * All tests run $0 with a FakeSynthesisProvider (canned responses through
 * the same ModelProvider seam the real AIGatewayProvider implements):
 * - broken-then-fixed code exercises the bounded repair loop for real:
 *   the broken source must fail `tsc --strict` inside the executor, the
 *   fixed source must pass tsc AND the contract's probe tests, and only
 *   then is an `implementation` Artifact registered.
 * - always-broken code must exhaust at exactly MAX_GENERATION_ATTEMPTS
 *   with an explicit failure and NO success artifact.
 * - the deterministic ScriptedModelProvider can never synthesize: the
 *   capability reports unavailable, the provider is never even called,
 *   and zero files are written.
 * - unparseable model output (no code fence) counts as a failed attempt.
 * - generated code is untrusted: the canned module sets a global flag on
 *   import; after a successful run the flag must be UNSET in this test
 *   process (probes run it in a child process via the executor — the lab
 *   process never imports generated code).
 */

import { existsSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore } from "../evidence/store";
import { LocalExecutor } from "../execution/executor";
import {
  type ModelProvider,
  ScriptedModelProvider,
} from "../investigation-engine/model";
import {
  type CodegenContract,
  generateSynthesizedAlternative,
  type LlmCodegenDeps,
  MAX_GENERATION_ATTEMPTS,
} from "./llm-codegen";

const TSC_BIN = join(
  process.cwd(),
  "node_modules",
  "typescript",
  "lib",
  "tsc.js",
);

/** Canned-response provider implementing the real ModelProvider seam. */
class FakeSynthesisProvider implements ModelProvider {
  readonly providerLabel = "fake-synthesis (test provider — canned responses)";
  readonly prompts: string[] = [];
  private readonly queue: string[];

  constructor(responses: string[]) {
    this.queue = [...responses];
  }

  async complete(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    const next = this.queue.shift();
    if (next === undefined) {
      throw new Error("FakeSynthesisProvider: no canned response left");
    }
    return next;
  }
}

/** Scripted provider that counts calls — synthesis must never call it. */
class CountingScriptedProvider extends ScriptedModelProvider {
  completeCalls = 0;
  override async complete(prompt: string): Promise<string> {
    this.completeCalls += 1;
    return super.complete(prompt);
  }
}

const BROKEN_TS = [
  "export function add(a: number, b: number): number {",
  "  const broken: string = a + b;",
  "  return broken;",
  "}",
].join("\n");

// Sets a global flag on import so tests can prove the lab process never
// imports generated code (probes run in a child process and DO import it).
const FIXED_TS = [
  "(globalThis as { __llmSynthesisImported?: boolean }).__llmSynthesisImported = true;",
  "export function add(a: number, b: number): number {",
  "  return a + b;",
  "}",
].join("\n");

function fenced(ts: string): string {
  return "Here is the implementation:\n\n```ts\n" + ts + "\n```\n";
}

const PROBE_SOURCE = [
  'const assert = require("node:assert");',
  "const mod = require(process.argv[2]);",
  "assert.strictEqual(mod.add(2, 3), 5);",
  "assert.strictEqual(mod.add(-1, 1), 0);",
  'console.log("probe ok");',
].join("\n");

function contract(): CodegenContract {
  return {
    behaviorToPreserve: "add(a, b) returns the arithmetic sum of a and b",
    objective: "Provide a minimal, dependency-free add() implementation",
    constraints: ["Single self-contained TypeScript module", "No imports"],
    requiredTests: [{ name: "add-contract", source: PROBE_SOURCE }],
    evaluationProcedure:
      "tsc --noEmit --strict must pass; then every required probe runs " +
      "with node against the compiled JS and must exit 0",
    targetContract: "export function add(a: number, b: number): number",
    hypothesisId: "hyp-llm-1",
  };
}

async function setup(provider: ModelProvider): Promise<{
  deps: LlmCodegenDeps;
  investigationId: string;
  referenceId: string;
  artifactsRoot: string;
}> {
  const root = mkdtempSync(join(tmpdir(), "lab-llm-codegen-"));
  const artifactsRoot = join(root, "artifacts");
  const store = new FileStore({ dataDir: join(root, "data") });
  const project = await store.createProject({
    name: "p",
    objective: "synthesized alternative",
  });
  const run = await store.createRun({
    projectId: project.id,
    objective: "synthesized alternative",
  });
  const reference = await store.addArtifact(run.id, {
    kind: "implementation",
    path: "samples/mini-kv/src/index.ts",
    description: "reference implementation",
  });
  const deps: LlmCodegenDeps = {
    store,
    executor: new LocalExecutor({ sandboxRoot: root }),
    artifactsRoot,
    tscBin: TSC_BIN,
    provider,
  };
  return {
    deps,
    investigationId: run.id,
    referenceId: reference.id,
    artifactsRoot,
  };
}

describe("generateSynthesizedAlternative", () => {
  it("(a) broken-then-fixed: repair loop registers an artifact with attempt evidence", {
    timeout: 120_000,
  }, async () => {
    const provider = new FakeSynthesisProvider([
      fenced(BROKEN_TS),
      fenced(FIXED_TS),
    ]);
    const { deps, investigationId, referenceId, artifactsRoot } =
      await setup(provider);

    const result = await generateSynthesizedAlternative(
      deps,
      investigationId,
      referenceId,
      contract(),
    );

    expect(result.status).toBe("generated");
    if (result.status !== "generated") return;
    expect(result.attempts).toBe(2);
    expect(result.artifact.kind).toBe("implementation");
    expect(result.artifact.path.endsWith(".js")).toBe(true);
    expect(result.artifact.description).toContain("Alternative implementation");
    // The synthesized source lives under the sandbox artifacts root.
    const tsPath = result.artifact.path.replace(/\.js$/, ".ts");
    expect(tsPath.startsWith(artifactsRoot)).toBe(true);
    const source = await readFile(tsPath, "utf8");
    expect(source).toContain("export function add");

    // Evidence records provider, attempts, the first tsc failure, probes.
    const evidence = await deps.store.listEvidence(investigationId);
    const synth = evidence.filter((e) => e.type === "codegen:llm-typescript");
    expect(synth.length).toBe(1);
    const obs = JSON.parse(synth[0].observation) as Record<string, unknown>;
    expect(obs.artifactId).toBe(result.artifact.id);
    expect(obs.hypothesisId).toBe("hyp-llm-1");
    expect(String(obs.provider)).toContain("fake-synthesis");
    const log = obs.attemptLog as Array<{ stage: string }>;
    expect(log.some((a) => a.stage === "tsc")).toBe(true);
    const probes = obs.probes as Array<{ name: string; exitCode: number }>;
    expect(probes).toEqual([{ name: "add-contract", exitCode: 0 }]);

    // Safety: the lab process never imported the generated module — the
    // import flag it sets is only set in the probe's child process.
    expect(
      (globalThis as { __llmSynthesisImported?: boolean })
        .__llmSynthesisImported,
    ).toBeUndefined();
  });

  it("(b) always-broken: exhausts at the attempt cap, explicit failure, no success artifact", {
    timeout: 120_000,
  }, async () => {
    const provider = new FakeSynthesisProvider([
      fenced(BROKEN_TS),
      fenced(BROKEN_TS),
      fenced(BROKEN_TS),
      fenced(FIXED_TS), // a 4th response exists but must never be consumed
    ]);
    const { deps, investigationId, referenceId } = await setup(provider);

    const result = await generateSynthesizedAlternative(
      deps,
      investigationId,
      referenceId,
      contract(),
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.attempts).toBe(MAX_GENERATION_ATTEMPTS);
    expect(provider.prompts.length).toBe(MAX_GENERATION_ATTEMPTS);
    expect(result.lastError).toMatch(/tsc/i);
    // Only the reference artifact exists — no success artifact registered.
    const artifacts = await deps.store.listArtifacts(investigationId);
    expect(artifacts.map((a) => a.id)).toEqual([referenceId]);
    // The failure itself is recorded as evidence — never hidden.
    const evidence = await deps.store.listEvidence(investigationId);
    const synth = evidence.filter((e) => e.type === "codegen:llm-typescript");
    expect(synth.length).toBe(1);
    expect(synth[0].observation).toContain('"failed"');
  });

  it("(c) scripted provider: capability unavailable, provider never called, zero files written", async () => {
    const provider = new CountingScriptedProvider({
      anything: "```ts\nexport const x = 1;\n```",
    });
    const { deps, investigationId, referenceId, artifactsRoot } =
      await setup(provider);

    const result = await generateSynthesizedAlternative(
      deps,
      investigationId,
      referenceId,
      contract(),
    );

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toMatch(/scripted|deterministic/i);
    expect(provider.completeCalls).toBe(0);
    expect(existsSync(artifactsRoot)).toBe(false);
    const artifacts = await deps.store.listArtifacts(investigationId);
    expect(artifacts.map((a) => a.id)).toEqual([referenceId]);
  });

  it("(d) unparseable model output counts as a failed attempt and exhausts", {
    timeout: 120_000,
  }, async () => {
    const provider = new FakeSynthesisProvider([
      "I would write some TypeScript here, trust me.",
      "Still no code fence in this response.",
      "No fence on the third try either.",
    ]);
    const { deps, investigationId, referenceId } = await setup(provider);

    const result = await generateSynthesizedAlternative(
      deps,
      investigationId,
      referenceId,
      contract(),
    );

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.attempts).toBe(MAX_GENERATION_ATTEMPTS);
    expect(result.attemptLog.every((a) => a.stage === "extract")).toBe(true);
    expect(result.lastError).toMatch(/fence|extract/i);
    const artifacts = await deps.store.listArtifacts(investigationId);
    expect(artifacts.map((a) => a.id)).toEqual([referenceId]);
  });
});
