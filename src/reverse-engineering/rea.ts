/**
 * REA CLI runner — Reverse Lab's reverse-engineering capability.
 *
 * Invocation follows docs/research/rea-integration.md §1 Option B:
 * `npx -y rea-agents@6.5.0 <command> <target> --json`, executed through an
 * `Executor`. stdout is pure JSON; logs go to stderr.
 *
 * SHAPE NOTE (verified 2026-10-16 against the real rea-agents@6.5.0 CLI):
 * the CLI `--json` output is a FLAT evidence record at the top level
 * (`evidence_id`, `provider`, `normalized_result`, `limitations[]`, …).
 * The `content[]` / `structuredContent` envelope in rea-integration.md §2 is
 * the MCP `CallToolResult` shape — the CLI flattens it. This module codes
 * against the real CLI shape. On failure the CLI exits non-zero and prints
 * a flat `{"error","code","category","message",…}` object on stdout.
 *
 * PERFORMANCE NOTE (verified 2026-10-16 in this sandbox): under the
 * executor's scrubbed env (PATH/HOME/LANG only), `npx -y rea-agents@6.5.0`
 * takes ~70s before REA itself starts (npx package handling; node/npm alone
 * are instant, and the identical command with a full env takes ~3s).
 * Invoking the REA CLI entrypoint directly takes ~5s. Operators that
 * pre-install rea-agents can set `REA_BIN` (via opts.env) to the CLI
 * binary (e.g. `<prefix>/node_modules/rea-agents/dist/cli.js`, run with
 * node, or a global `rea` shim) and skip npx entirely. The npx default is
 * kept because it self-bootstraps on a clean machine per the verified docs.
 */

import type { Executor } from "../execution/executor";
import { type Evidence, isReaEvidenceId, nowIso } from "../types";

/** Pinned REA package — the exact binary invoked by every runner call. */
export const REA_PACKAGE = "rea-agents@6.5.0";

/**
 * Flat CLI evidence record. Field set verified against real
 * `rea analyze-javascript-application … --json` output (see fixtures/).
 * Unknown future fields are tolerated; only the listed ones are read.
 */
export interface ReaCliEvidence {
  evidence_id: string;
  subject: unknown;
  provider: { id: string; name: string; version: string };
  analysis_profile: unknown;
  predicate_type: string;
  operation: string;
  parameters: unknown;
  raw_result: unknown;
  normalized_result: unknown;
  confidence: string;
  authority: string;
  environment: unknown;
  limitations: string[];
  relationship_coverage: unknown;
  locations: unknown;
  evidence_links: unknown;
}

/** Flat CLI error record (real shape on non-zero exit). */
export interface ReaCliError {
  error: string;
  code: string;
  category: string;
  message: string;
  retryable?: boolean;
  remediation?: unknown;
  details?: unknown;
}

function isReaCliError(value: unknown): value is ReaCliError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).error === "string" &&
    typeof (value as Record<string, unknown>).code === "string"
  );
}

/** Thrown when REA fails or returns an unparseable/unverifiable result. */
export class ReaError extends Error {
  readonly code?: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly details: unknown;

  constructor(
    message: string,
    opts: {
      code?: string;
      exitCode: number;
      stderr: string;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = "ReaError";
    this.code = opts.code;
    this.exitCode = opts.exitCode;
    this.stderr = opts.stderr;
    this.details = opts.details;
  }
}

/**
 * Parse one REA `--json` stdout payload. Pure function — unit-tested against
 * real CLI output fixtures. Throws ReaError on: non-JSON stdout, the CLI
 * error envelope, or a malformed `evidence_id` (cheap integrity check).
 */
export function parseReaJsonOutput(stdout: string): ReaCliEvidence {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new ReaError("REA returned non-JSON stdout", {
      exitCode: -1,
      stderr: "",
      details: { stdoutHead: stdout.slice(0, 500) },
    });
  }
  if (isReaCliError(parsed)) {
    throw new ReaError(
      `REA failed [${parsed.code}/${parsed.category}]: ${parsed.message}`,
      {
        code: parsed.code,
        exitCode: -1,
        stderr: "",
        details: parsed,
      },
    );
  }
  const record = parsed as ReaCliEvidence;
  if (
    typeof record.evidence_id !== "string" ||
    !isReaEvidenceId(record.evidence_id)
  ) {
    throw new ReaError(
      `REA returned a malformed evidence_id: ${String(record.evidence_id)}`,
      {
        exitCode: -1,
        stderr: "",
        details: { recordKeys: Object.keys(record) },
      },
    );
  }
  if (!Array.isArray(record.limitations)) {
    throw new ReaError("REA evidence is missing its limitations[]", {
      exitCode: -1,
      stderr: "",
      details: { evidence_id: record.evidence_id },
    });
  }
  return record;
}

export interface ReaRunOptions {
  /** Working directory for the npx invocation (default: process.cwd()). */
  cwd?: string;
  /** Kill the REA process after this long (default: 300_000). */
  timeoutMs?: number;
  /** Extra env for the REA process, e.g. REA_* engine configuration. */
  env?: Record<string, string>;
}

/**
 * Build the process invocation for REA. Default is the documented
 * `npx -y rea-agents@6.5.0` self-bootstrapping form; when `REA_BIN` is set
 * in opts.env it is invoked directly (faster, hermetic — recommended when
 * rea-agents is pre-installed in the execution environment).
 */
function reaInvocation(opts?: ReaRunOptions): {
  cmd: string;
  prefix: string[];
} {
  const bin = opts?.env?.REA_BIN;
  if (bin) {
    return { cmd: bin, prefix: [] };
  }
  return { cmd: "npx", prefix: ["-y", REA_PACKAGE] };
}

/**
 * Run one REA one-shot command and return the parsed evidence record.
 * stderr is treated as logs (surfaced on ReaError), never parsed.
 */
export async function runReaJsonCommand(
  executor: Executor,
  command: string,
  args: string[],
  opts?: ReaRunOptions,
): Promise<ReaCliEvidence> {
  const { cmd, prefix } = reaInvocation(opts);
  const result = await executor.run(
    cmd,
    [...prefix, command, ...args, "--json"],
    {
      cwd: opts?.cwd ?? ".",
      timeoutMs: opts?.timeoutMs ?? 300_000,
      env: opts?.env,
    },
  );
  try {
    const record = parseReaJsonOutput(result.stdout);
    if (result.exitCode !== 0) {
      throw new ReaError(
        `REA ${command} exited ${result.exitCode} but returned an evidence record`,
        {
          exitCode: result.exitCode,
          stderr: result.stderr,
          details: { evidence_id: record.evidence_id },
        },
      );
    }
    return record;
  } catch (err) {
    if (err instanceof ReaError) {
      // Attach the real exit code / stderr the pure parser never saw.
      throw new ReaError(err.message, {
        code: err.code,
        exitCode: result.exitCode,
        stderr: result.stderr,
        details: err.details,
      });
    }
    throw err;
  }
}

/**
 * Map a REA evidence record to the lab `Evidence` contract
 * (docs/research/rea-integration.md §3, adapted to the real CLI shape):
 *
 * - id: `evidence_id` verbatim — content-addressed, dedup for free.
 * - type: `rea:<operation>` (e.g. `rea:analyze_javascript_application`).
 * - source: the exact pinned package invoked.
 * - observation: `normalized_result` — the operation result (READ THIS).
 * - limitations: top-level `limitations[]` stored VERBATIM.
 * - verification: `observed` — static analysis of a shipped artifact is a
 *   tool observation (real runs report authority `shipped-artifact`), not a
 *   measurement (nothing executed) and not an inference.
 * - provenance: everything needed to reproduce/audit (tool, predicate,
 *   provider, profile, parameters, subject, raw result, coverage…).
 */
export function reaEvidenceToLabEvidence(record: ReaCliEvidence): Evidence {
  return {
    id: record.evidence_id,
    type: `rea:${record.operation}`,
    source: REA_PACKAGE,
    observation: JSON.stringify(record.normalized_result),
    limitations: [...record.limitations],
    verification: "observed",
    provenance: {
      tool: record.operation,
      predicateType: record.predicate_type,
      provider: record.provider,
      analysisProfile: record.analysis_profile,
      parameters: record.parameters,
      subject: record.subject,
      rawResult: record.raw_result,
      relationshipCoverage: record.relationship_coverage,
      confidence: record.confidence,
      authority: record.authority,
      environment: record.environment,
      locations: record.locations,
      evidenceLinks: record.evidence_links,
    },
    createdAt: nowIso(),
  };
}

/** Zero-engine: statically reconstruct a local JS/Electron application. */
export async function analyzeJavascriptApplication(
  executor: Executor,
  targetPath: string,
  opts?: ReaRunOptions,
): Promise<ReaCliEvidence> {
  return runReaJsonCommand(
    executor,
    "analyze-javascript-application",
    [targetPath],
    opts,
  );
}

/** Zero-engine: inspect a SQLite database snapshot (schema + sample rows). */
export async function inspectSqliteDatabase(
  executor: Executor,
  dbPath: string,
  opts?: ReaRunOptions & { table?: string; rowLimit?: number },
): Promise<ReaCliEvidence> {
  const args = [dbPath];
  if (opts?.table) {
    args.push("--table", opts.table);
  }
  if (opts?.rowLimit !== undefined) {
    args.push("--row-limit", String(opts.rowLimit));
  }
  return runReaJsonCommand(executor, "inspect-sqlite-database", args, opts);
}

export interface ReaScopeCheck {
  name: string;
  ok: boolean;
  classification: string;
  detail?: string;
  remediation?: string;
}

export interface ReaReadiness {
  /** The `rea doctor` command itself ran and produced a parseable report. */
  ok: boolean;
  /** REA's own verdict (`healthy:` in the report); null when unparseable. */
  healthy: boolean | null;
  /** scope_checks entries, e.g. node/host healthy, native engines missing. */
  checks: ReaScopeCheck[];
  /** Raw report output, surfaced verbatim for the caller to interpret. */
  output: string;
}

/**
 * Run `rea doctor` and surface its readiness report honestly.
 * Never throws for an unhealthy report — `healthy: false` (e.g. no native
 * engines installed) is a legitimate, reportable state for the zero-engine
 * PoC. Only hard invocation failures (spawn errors) propagate.
 */
export async function checkReadiness(
  executor: Executor,
  opts?: ReaRunOptions,
): Promise<ReaReadiness> {
  const { cmd, prefix } = reaInvocation(opts);
  const result = await executor.run(
    cmd,
    [...prefix, "doctor", "--format", "json"],
    {
      cwd: opts?.cwd ?? ".",
      // Generous: the npx path alone can take ~75s under a scrubbed env
      // before `rea doctor` starts (see PERFORMANCE NOTE above).
      timeoutMs: opts?.timeoutMs ?? 180_000,
      env: opts?.env,
    },
  );
  const output = result.stdout.trim();
  try {
    const parsed = JSON.parse(output) as {
      healthy?: boolean;
      scope_checks?: ReaScopeCheck[];
    };
    const hasReport =
      typeof parsed.healthy === "boolean" ||
      Array.isArray(parsed.scope_checks);
    return {
      // ok = the command ran and produced a parseable report. A report that
      // says healthy:false (e.g. no native engines) still counts: doctor
      // exits non-zero in that case, which is a legitimate, reportable state.
      ok: hasReport,
      healthy: typeof parsed.healthy === "boolean" ? parsed.healthy : null,
      checks: Array.isArray(parsed.scope_checks) ? parsed.scope_checks : [],
      output,
    };
  } catch {
    return {
      ok: false,
      healthy: null,
      checks: [],
      output: output || result.stderr,
    };
  }
}
