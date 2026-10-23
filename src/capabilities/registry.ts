/**
 * Capability registry — the closed, honest list of what Reverse Lab can do.
 *
 * Each capability is backed by a real, verified implementation:
 * - `rea-javascript-app` → `analyzeJavascriptApplication` in
 *   src/reverse-engineering/rea.ts (verified 2026-10-16 against
 *   rea-agents@6.5.0; zero-engine static analysis).
 * - `rea-sqlite` → `inspectSqliteDatabase` in the same module (verified).
 * - `rea-native` → NOT backed by an installed engine. `rea doctor` reports
 *   native analysis engines missing on this host, so this entry carries a
 *   `needs-configuration` limitation and must never be scheduled until an
 *   operator installs a supported engine (Ghidra, Hopper, IDA, JEB, Cutter,
 *   Rizin, GDB). The entry exists to make the gap visible, not to fill it.
 * - `codegen-typescript` → src/artifacts/codegen.ts (deterministic
 *   transform, typechecked inside the executor).
 * - `codegen-llm-typescript` → src/artifacts/llm-codegen.ts (contract-first
 *   free-form synthesis by a real model provider, verified inside the
 *   executor). Like `rea-native`, it is honest about its configuration
 *   requirement: with only the deterministic scripted provider available
 *   it reports unavailable — it never fakes generated code.
 * - `experiment-run` → src/experiments/runner.ts (isolated LocalExecutor
 *   runs, real measurements, no invented scores).
 *
 * No other capability may be listed here without a verified implementation.
 */

export interface Capability {
  id: string;
  purpose: string;
  /** ResearchTarget kinds this capability can inspect (lab artifacts use []). */
  targetKinds: string[];
  /** Field name → human-readable type/description. */
  inputSchema: Record<string, string>;
  outputKind: string;
  /** `type` of the Evidence this capability produces. */
  evidenceKind: string;
  /** Runtime dependencies that must be present (pinned where possible). */
  dependencies: string[];
  /** Always non-empty: what the capability cannot do, stated plainly. */
  limitations: string[];
  permission: "read-target" | "execute-sandbox" | "network";
}

const REA_VERSION = "rea-agents@6.5.0";

const CAPABILITIES: Capability[] = [
  {
    id: "rea-javascript-app",
    purpose:
      "Statically reconstruct a JavaScript/TypeScript/Electron application: " +
      "module structure, entry points, dependencies. Verified zero-engine " +
      `operation against ${REA_VERSION} (2026-10-16).`,
    targetKinds: ["repo", "component"],
    inputSchema: {
      targetPath:
        "string — path to the JS/TS application directory (repo-relative or absolute)",
    },
    outputKind: "analysis-report",
    evidenceKind: "rea:analyze_javascript_application",
    dependencies: [REA_VERSION, "node"],
    limitations: [
      "Static analysis only: observes shipped code, never executes it.",
      "Findings reflect the code at analysis time; behavior at runtime (e.g. " +
        "dynamic imports, eval) may differ.",
    ],
    permission: "read-target",
  },
  {
    id: "rea-sqlite",
    purpose:
      "Inspect a SQLite database snapshot: schema and bounded sample rows. " +
      `Verified zero-engine operation against ${REA_VERSION} (2026-10-16).`,
    targetKinds: ["component", "feature"],
    inputSchema: {
      dbPath: "string — path to the .sqlite/.db file",
      table: "string? — optional table to inspect (default: all tables)",
      rowLimit: "number? — max sample rows per table (bounded by default)",
    },
    outputKind: "analysis-report",
    evidenceKind: "rea:inspect_sqlite_database",
    dependencies: [REA_VERSION, "node"],
    limitations: [
      "Reads a snapshot; does not observe live queries or write-ahead behavior.",
      "Row sampling is bounded: conclusions about full-table contents need " +
        "explicit verification.",
    ],
    permission: "read-target",
  },
  {
    id: "rea-native",
    purpose:
      "Deep analysis of native binaries (Ghidra/Hopper/IDA/JEB/Cutter/Rizin/GDB " +
      "class engines).",
    targetKinds: ["component"],
    inputSchema: {
      binaryPath: "string — path to the native binary to analyze",
    },
    outputKind: "analysis-report",
    evidenceKind: "rea:native-analysis",
    dependencies: [REA_VERSION, "native-analysis-engine"],
    limitations: [
      "NEEDS-CONFIGURATION: no native analysis engine installed on this host " +
        "(rea doctor scope check fails). This capability is unavailable until " +
        "an operator installs and configures a supported engine.",
      "Even when configured, the exact CLI command/evidence shape is " +
        "UNVERIFIED against a real engine — treat first results as provisional.",
    ],
    permission: "read-target",
  },
  {
    id: "codegen-typescript",
    purpose:
      "Generate a deterministic TypeScript alternative implementation for a " +
      "reference artifact (e.g. Map-based store → plain-object store), " +
      "typechecked with tsc inside the sandbox executor. The transform is " +
      "explicit and reviewable — never free-form generation.",
    targetKinds: [],
    inputSchema: {
      investigationId: "string — the owning investigation run id",
      referenceArtifactId:
        "string — artifact id of the reference implementation",
      objective: "string — what the alternative must preserve or improve",
    },
    outputKind: "implementation-artifact",
    evidenceKind: "codegen:typescript",
    dependencies: ["typescript", "node"],
    limitations: [
      "Deterministic template transform only; no LLM-driven code synthesis in " +
        "the MVP. Only the documented transforms are available.",
      "Behavioral equivalence is claimed only after the generated code " +
        "compiles AND passes the same tests as the reference.",
    ],
    permission: "execute-sandbox",
  },
  {
    id: "codegen-llm-typescript",
    purpose:
      "Generate a free-form TypeScript alternative implementation by LLM " +
      "synthesis under a contract fixed BEFORE generation (behavior to " +
      "preserve, objective, constraints, required probe tests, evaluation " +
      "procedure, target contract — plan §8). The synthesized source is " +
      "verified inside the sandbox executor (tsc --strict + contract " +
      "probes) with a bounded repair loop (3 attempts), then registered " +
      "as an implementation artifact with full attempt evidence.",
    targetKinds: [],
    inputSchema: {
      investigationId: "string — the owning investigation run id",
      referenceArtifactId:
        "string — artifact id of the reference implementation",
      contract:
        "CodegenContract — behaviorToPreserve, objective, constraints[], " +
        "requiredTests[] (executable probes), evaluationProcedure, " +
        "targetContract, hypothesisId?",
    },
    outputKind: "implementation-artifact",
    evidenceKind: "codegen:llm-typescript",
    dependencies: [
      "ai-gateway (AI_GATEWAY_API_KEY + AI_GATEWAY_MODEL)",
      "typescript",
      "node",
    ],
    limitations: [
      "NEEDS-CONFIGURATION: requires a real model provider (AI Gateway). " +
        "The deterministic scripted provider cannot synthesize — the " +
        "capability reports unavailable with a reason instead of routing " +
        "canned text into codegen.",
      "Generated code is untrusted: it is only written and executed " +
        "inside the Executor sandbox, never imported by the lab process.",
      "Behavioral equivalence beyond the contract's probe tests is " +
        "UNVERIFIED, and real-model synthesis quality is UNVERIFIED — no " +
        "live model run has been performed in this environment (no AI " +
        "Gateway key); behavioral tests use a fake provider.",
    ],
    permission: "execute-sandbox",
  },
  {
    id: "experiment-run",
    purpose:
      "Execute an experiment spec in a fresh sandbox directory: run the " +
      "procedure against reference and alternative artifacts, collect each " +
      "spec.measurement for spec.repetitions, and record full environment " +
      "context. Reports raw stats only (n, mean, min, max, delta vs " +
      "reference) — no composite scores.",
    targetKinds: [],
    inputSchema: {
      experimentId: "string — the experiment spec to execute",
    },
    outputKind: "test-result",
    evidenceKind: "experiment:run",
    dependencies: ["node", "vitest"],
    limitations: [
      "LocalExecutor isolation (sandbox directory + scrubbed env); not a " +
        "Firecracker microVM — adequate for trusted PoC targets, not for " +
        "untrusted binaries.",
      "Measurements are wall-clock on the lab host: noisy for micro-scale " +
        "workloads. Design procedures that produce signal above the noise " +
        "floor, and report raw values so anyone can re-analyze.",
    ],
    permission: "execute-sandbox",
  },
];

/** The exact capability ids the lab supports — asserted by tests. */
export const KNOWN_CAPABILITY_IDS = [
  "rea-javascript-app",
  "rea-sqlite",
  "rea-native",
  "codegen-typescript",
  "codegen-llm-typescript",
  "experiment-run",
] as const;

/** All registered capabilities. */
export function listCapabilities(): Capability[] {
  return [...CAPABILITIES];
}

/** Look up one capability by id. */
export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

/** Capabilities able to inspect targets of the given ResearchTarget kind. */
export function capabilitiesForTargetKind(kind: string): Capability[] {
  return CAPABILITIES.filter((c) => c.targetKinds.includes(kind));
}
