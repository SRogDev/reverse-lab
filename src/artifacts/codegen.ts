/**
 * Deterministic TypeScript code generation for alternative implementations.
 *
 * The MVP does NOT do free-form LLM code synthesis. `generateAlternative`
 * selects one of the documented, reviewed transforms below and emits its
 * fixed template. Deterministic means: same transform in → byte-identical
 * source out. The template is then:
 * 1. typechecked with tsc `--noEmit --strict` INSIDE the executor
 *    (a type error throws — no pseudo-code ever ships), then
 * 2. compiled to CommonJS next to the source, and
 * 3. registered as an `implementation` Artifact, with codegen evidence
 *    linking it to the hypothesis under test.
 *
 * AVAILABLE TRANSFORMS (the complete list — anything else throws):
 * - `map-to-object-store`: Map-based KV (mini-kv reference) → null-prototype
 *   plain-object storage with an EAGER TTL sweep on every write (the
 *   reference sweeps lazily on read). Interface-compatible: MiniKV,
 *   SetOptions, createStore — the same tests run against both.
 *
 * Honest limitations:
 * - The transform does not inspect the reference source; interface
 *   compatibility is verified empirically (shared test procedure), not
 *   proven.
 * - Behavioral equivalence beyond the exercised procedure is UNVERIFIED.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../evidence/store";
import type { Executor } from "../execution/executor";
import { generateId, nowIso, type Artifact } from "../types";

export type CodegenTransform = "map-to-object-store";

const KNOWN_TRANSFORMS: CodegenTransform[] = ["map-to-object-store"];

export interface CodegenDeps {
  store: Store;
  executor: Executor;
  /** Directory where `<artifactId>.ts` / `<artifactId>.js` are written. */
  artifactsRoot: string;
  /** Absolute path to the TypeScript compiler (typescript/lib/tsc.js). */
  tscBin: string;
}

/**
 * Fixed template for `map-to-object-store`. Reviewed source — the only
 * thing that varies per call is the header comment (artifact id, date).
 */
function objectStoreTemplate(header: string): string {
  return `/**
${header}
 *
 * object-kv — deterministic alternative to the Map-based mini-kv reference.
 * Transform: map-to-object-store (reverse-lab codegen, fixed template).
 * - storage: null-prototype plain object instead of Map
 * - expiry: EAGER sweep on every write (reference: lazy expiry on read)
 * Interface-compatible with mini-kv: MiniKV, SetOptions, createStore.
 */

export interface SetOptions {
  /** Time-to-live in milliseconds; entry never expires when omitted. */
  ttlMs?: number;
}

interface Entry {
  value: unknown;
  /** Absolute wall-clock deadline (Date.now() ms), or null for no expiry. */
  expiresAt: number | null;
}

function isExpired(entry: Entry, nowMs: number): boolean {
  return entry.expiresAt !== null && entry.expiresAt <= nowMs;
}

export class MiniKV {
  private readonly store: Record<string, Entry> = Object.create(null);

  set(key: string, value: unknown, opts?: SetOptions): void {
    const expiresAt =
      opts?.ttlMs !== undefined ? Date.now() + opts.ttlMs : null;
    this.sweep(); // eager: evict expired entries on every write
    this.store[key] = { value, expiresAt };
  }

  get<T = unknown>(key: string): T | undefined {
    const entry: Entry | undefined = this.store[key];
    if (!entry) {
      return undefined;
    }
    if (isExpired(entry, Date.now())) {
      delete this.store[key];
      return undefined;
    }
    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    if (this.store[key] !== undefined) {
      delete this.store[key];
      return true;
    }
    return false;
  }

  /** Eagerly evict expired entries; returns the number removed. */
  sweep(): number {
    const nowMs = Date.now();
    let removed = 0;
    for (const key of Object.keys(this.store)) {
      if (isExpired(this.store[key] as Entry, nowMs)) {
        delete this.store[key];
        removed += 1;
      }
    }
    return removed;
  }

  /** Live (non-expired) keys. */
  keys(): string[] {
    const nowMs = Date.now();
    const live: string[] = [];
    for (const key of Object.keys(this.store)) {
      const entry = this.store[key] as Entry;
      if (isExpired(entry, nowMs)) {
        delete this.store[key];
      } else {
        live.push(key);
      }
    }
    return live;
  }

  size(): number {
    return this.keys().length;
  }

  clear(): void {
    for (const key of Object.keys(this.store)) {
      delete this.store[key];
    }
  }
}

/** Convenience: build a MiniKV preloaded with the given entries. */
export function createStore(
  entries: Record<string, unknown> = {},
  opts?: SetOptions,
): MiniKV {
  const kv = new MiniKV();
  for (const [key, value] of Object.entries(entries)) {
    kv.set(key, value, opts);
  }
  return kv;
}
`;
}

function selectTransform(
  objective: string,
  explicit?: CodegenTransform,
): CodegenTransform {
  if (explicit !== undefined) {
    if (!KNOWN_TRANSFORMS.includes(explicit)) {
      throw new Error(
        `unknown transform "${explicit}" — known: ${KNOWN_TRANSFORMS.join(", ")}`,
      );
    }
    return explicit;
  }
  const text = objective.toLowerCase();
  if (
    text.includes("plain-object") ||
    text.includes("plain object") ||
    text.includes("object store") ||
    text.includes("simpler") ||
    text.includes("alternative")
  ) {
    return "map-to-object-store";
  }
  // The MVP has exactly one transform; default to it rather than inventing.
  return "map-to-object-store";
}

async function typecheckAndCompile(
  deps: CodegenDeps,
  tsPath: string,
  jsPath: string,
): Promise<void> {
  const check = await deps.executor.run(
    "node",
    [deps.tscBin, "--noEmit", "--strict", "--target", "es2022", tsPath],
    { cwd: ".", timeoutMs: 120_000 },
  );
  if (check.exitCode !== 0) {
    throw new Error(
      `generated TypeScript failed tsc --noEmit (exit ${check.exitCode}):\n` +
        check.stderr.slice(0, 2000),
    );
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
      "--outDir",
      deps.artifactsRoot,
      tsPath,
    ],
    { cwd: ".", timeoutMs: 120_000 },
  );
  if (emit.exitCode !== 0) {
    throw new Error(
      `generated TypeScript failed tsc emit (exit ${emit.exitCode}):\n` +
        emit.stderr.slice(0, 2000),
    );
  }
  if (jsPath !== tsPath.replace(/\.ts$/, ".js")) {
    throw new Error(`internal error: unexpected emit layout for ${tsPath}`);
  }
}

/**
 * Generate a deterministic alternative implementation, typecheck + compile
 * it inside the executor, and register it as an Artifact linked (via
 * description and evidence) to the hypothesis under test.
 */
export async function generateAlternative(
  deps: CodegenDeps,
  investigationId: string,
  referenceArtifactId: string,
  objective: string,
  opts?: { hypothesisId?: string; transform?: CodegenTransform },
): Promise<Artifact> {
  const transform = selectTransform(objective, opts?.transform);
  const artifactId = generateId();
  const tsPath = join(deps.artifactsRoot, `${artifactId}.ts`);
  const jsPath = join(deps.artifactsRoot, `${artifactId}.js`);

  const header =
    ` * Generated ${nowIso()} by reverse-lab codegen (deterministic template).` +
    `\n * transform=${transform} artifact=${artifactId}`;
  const source = objectStoreTemplate(header);

  await mkdir(deps.artifactsRoot, { recursive: true });
  await writeFile(tsPath, source, "utf8");
  await typecheckAndCompile(deps, tsPath, jsPath);

  const description =
    `Alternative implementation (transform=${transform}) for reference ` +
    `artifact ${referenceArtifactId}. TypeScript source alongside the ` +
    `compiled JS; tsc --strict clean.` +
    (opts?.hypothesisId ? ` Tests hypothesis ${opts.hypothesisId}.` : "");

  const artifact = await deps.store.addArtifact(investigationId, {
    kind: "implementation",
    path: jsPath,
    description,
  });

  await deps.store.addEvidence(investigationId, {
    type: "codegen:typescript",
    source: "reverse-lab codegen (deterministic template)",
    observation: JSON.stringify({
      artifactId: artifact.id,
      transform,
      referenceArtifactId,
      hypothesisId: opts?.hypothesisId ?? null,
      compiled: true,
      tsSource: tsPath,
    }),
    limitations: [
      "Deterministic template transform — not free-form synthesis; interface " +
        "compatibility is verified empirically (shared procedure), not proven.",
      "Behavioral equivalence beyond the exercised procedure is UNVERIFIED.",
    ],
    verification: "observed",
    provenance: {
      transform,
      tscStrict: true,
      generator: "reverse-lab codegen",
    },
  });

  return artifact;
}
