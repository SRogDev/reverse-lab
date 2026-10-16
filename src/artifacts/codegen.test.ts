/**
 * Codegen tests — deterministic TypeScript alternatives.
 *
 * The generated code MUST compile (real tsc via LocalExecutor — no
 * pseudo-code) and be test-runnable: the test imports the emitted JS and
 * exercises the KV interface for real, including actual TTL expiry.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { FileStore } from "../evidence/store";
import { LocalExecutor } from "../execution/executor";
import { type CodegenDeps, generateAlternative } from "./codegen";

const TSC_BIN = join(
  process.cwd(),
  "node_modules",
  "typescript",
  "lib",
  "tsc.js",
);

async function setup(): Promise<{
  deps: CodegenDeps;
  investigationId: string;
  referenceId: string;
}> {
  const root = mkdtempSync(join(tmpdir(), "lab-codegen-"));
  const artifactsRoot = join(root, "artifacts");
  const store = new FileStore({ dataDir: join(root, "data") });
  const project = await store.createProject({
    name: "p",
    objective: "simpler kv",
  });
  const run = await store.createRun({
    projectId: project.id,
    objective: "simpler kv",
  });
  const reference = await store.addArtifact(run.id, {
    kind: "implementation",
    path: "samples/mini-kv/src/index.ts",
    description: "reference mini-kv",
  });
  const deps: CodegenDeps = {
    store,
    executor: new LocalExecutor({ sandboxRoot: root }),
    artifactsRoot,
    tscBin: TSC_BIN,
  };
  return { deps, investigationId: run.id, referenceId: reference.id };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("generateAlternative", () => {
  // Each test spawns tsc twice through the executor (~2-4s per spawn).
  // Vitest's default 5s timeout is too tight; 120s matches the executor's.
  // (vitest 5 supports a per-test timeout as the third `it` argument,
  // not on describe — so it is set on each test below.)
  it("emits TypeScript that compiles and registers an implementation artifact", {
    timeout: 120_000,
  }, async () => {
    const { deps, investigationId, referenceId } = await setup();
    const artifact = await generateAlternative(
      deps,
      investigationId,
      referenceId,
      "build a simpler plain-object alternative",
      { hypothesisId: "hyp-1" },
    );
    expect(artifact.kind).toBe("implementation");
    expect(artifact.path.endsWith(".js")).toBe(true);
    expect(artifact.description).toContain("hyp-1");
    // The .ts source lives next to the emitted .js.
    const { readFile } = await import("node:fs/promises");
    const tsSource = await readFile(
      artifact.path.replace(/\.js$/, ".ts"),
      "utf8",
    );
    expect(tsSource).toContain("class MiniKV");
    expect(tsSource).toContain("createStore");
  });

  it("produces a real, runnable variant: TTL semantics hold", {
    timeout: 120_000,
  }, async () => {
    const { deps, investigationId, referenceId } = await setup();
    const artifact = await generateAlternative(
      deps,
      investigationId,
      referenceId,
      "simpler alternative",
    );
    const mod = (await import(pathToFileURL(artifact.path).href)) as {
      MiniKV: new () => {
        set(k: string, v: unknown, opts?: { ttlMs?: number }): void;
        get<T>(k: string): T | undefined;
        has(k: string): boolean;
        delete(k: string): boolean;
        sweep(): number;
        keys(): string[];
        size(): number;
        clear(): void;
      };
    };
    const kv = new mod.MiniKV();
    kv.set("a", 1);
    expect(kv.get("a")).toBe(1);
    expect(kv.has("a")).toBe(true);
    kv.set("temp", 2, { ttlMs: 30 });
    expect(kv.get("temp")).toBe(2);
    await sleep(80);
    expect(kv.get("temp")).toBeUndefined();
    expect(kv.has("temp")).toBe(false);
    kv.set("x", 9);
    expect(kv.delete("x")).toBe(true);
    expect(kv.size()).toBe(1);
    kv.clear();
    expect(kv.size()).toBe(0);
  });

  it("records codegen evidence linked to the hypothesis", {
    timeout: 120_000,
  }, async () => {
    const { deps, investigationId, referenceId } = await setup();
    const artifact = await generateAlternative(
      deps,
      investigationId,
      referenceId,
      "simpler alternative",
      { hypothesisId: "hyp-9" },
    );
    const evidence = await deps.store.listEvidence(investigationId);
    const codegen = evidence.filter((e) => e.type === "codegen:typescript");
    expect(codegen.length).toBeGreaterThan(0);
    expect(codegen[0].observation).toContain(artifact.id);
    expect(codegen[0].observation).toContain("hyp-9");
  });

  it(
    "compiles even when the executor cwd contains unrelated @types packages",
    { timeout: 120_000 },
    async () => {
      // Regression: tsc auto-includes @types from the executor cwd; the
      // repo root has @types that fail under default moduleResolution.
      // The generated file is self-contained, so codegen must not trip.
      const first = await setup();
      const artifactsRoot = mkdtempSync(join(tmpdir(), "lab-codegen-repo-"));
      const repoDeps: CodegenDeps = {
        store: first.deps.store,
        executor: new LocalExecutor({ sandboxRoot: process.cwd() }),
        artifactsRoot,
        tscBin: TSC_BIN,
      };
      const artifact = await generateAlternative(
        repoDeps,
        first.investigationId,
        first.referenceId,
        "simpler alternative",
      );
      expect(artifact.path.endsWith(".js")).toBe(true);
    },
  );

  it("rejects unknown transforms instead of inventing one", async () => {
    const { deps, investigationId, referenceId } = await setup();
    await expect(
      generateAlternative(deps, investigationId, referenceId, "whatever", {
        // Deliberate type escape: the runtime must reject unknown transforms
        // for plain-JS callers the compiler cannot see.
        transform: "quantum-kv" as unknown as "map-to-object-store",
      }),
    ).rejects.toThrow(/unknown transform/i);
  });
});
