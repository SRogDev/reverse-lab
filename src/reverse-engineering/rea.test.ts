import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalExecutor } from "../execution/executor";
import {
  analyzeJavascriptApplication,
  checkReadiness,
  parseReaJsonOutput,
  REA_PACKAGE,
  ReaError,
  reaEvidenceToLabEvidence,
  runReaJsonCommand,
} from "./rea";

const FIXTURES = join(__dirname, "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

describe("parseReaJsonOutput (fixture: real CLI output)", () => {
  it("parses the flat CLI evidence envelope", () => {
    const record = parseReaJsonOutput(
      loadFixture("rea-analyze-javascript-application.json"),
    );
    expect(record.evidence_id).toMatch(/^ev_[0-9a-f]{64}$/);
    expect(record.operation).toBe("analyze_javascript_application");
    expect(record.provider.id).toBe("rea-javascript-application");
    expect(record.limitations).toHaveLength(5);
  });

  it("rejects a tampered evidence_id", () => {
    const tampered = loadFixture(
      "rea-analyze-javascript-application.json",
    ).replace(
      /"evidence_id": "ev_[0-9a-f]{64}"/,
      '"evidence_id": "ev_deadbeef"',
    );
    expect(() => parseReaJsonOutput(tampered)).toThrow(ReaError);
  });

  it("surfaces the CLI error envelope as a ReaError with code and message", () => {
    const err = (() => {
      try {
        parseReaJsonOutput(loadFixture("rea-error-invalid-input.json"));
      } catch (e) {
        return e as ReaError;
      }
      throw new Error("expected parseReaJsonOutput to throw");
    })();
    expect(err).toBeInstanceOf(ReaError);
    expect(err.code).toBe("invalid_request");
    expect(err.message).toContain("invalid_input");
  });

  it("rejects non-JSON stdout", () => {
    expect(() => parseReaJsonOutput("not json at all")).toThrow(ReaError);
  });
});

describe("reaEvidenceToLabEvidence (mapping per rea-integration.md §3)", () => {
  it("maps the real record to the lab Evidence contract", () => {
    const record = parseReaJsonOutput(
      loadFixture("rea-analyze-javascript-application.json"),
    );
    const evidence = reaEvidenceToLabEvidence(record);

    // id: REA evidence_id used verbatim (content-addressed, dedup for free).
    expect(evidence.id).toBe(record.evidence_id);
    // type carries the REA operation.
    expect(evidence.type).toBe("rea:analyze_javascript_application");
    // source names the exact package invoked.
    expect(evidence.source).toBe(REA_PACKAGE);
    // limitations stored VERBATIM from the CLI output.
    expect(evidence.limitations).toEqual(record.limitations);
    // observation is the normalized_result (the operation result — READ THIS).
    const observation = JSON.parse(evidence.observation) as {
      statistics: { parsed_javascript_files: number };
    };
    expect(observation.statistics.parsed_javascript_files).toBe(2);
    // Static analysis of a shipped artifact is a tool observation.
    expect(evidence.verification).toBe("observed");
    // Provenance keeps everything needed to reproduce / audit.
    const provenance = evidence.provenance as Record<string, unknown>;
    expect(provenance).toMatchObject({
      tool: "analyze_javascript_application",
      predicateType: "rea.javascript-application-analysis",
    });
    expect(provenance.provider).toEqual(record.provider);
    expect(provenance.rawResult).toBe(record.raw_result);
    expect(evidence.createdAt).not.toBe("");
  });
});

describe("runReaJsonCommand (live integration: real REA CLI)", () => {
  // Runs the actual `npx -y rea-agents@6.5.0` binary. Requires network for
  // the first npx install; afterwards the npx cache is reused.
  // Rooted at a fresh tmpdir so probe targets never pollute the repo.
  const probeRoot = mkdtempSync(join(tmpdir(), "rl-rea-probe-"));
  const executor = new LocalExecutor({ sandboxRoot: probeRoot });

  it("analyzes a real JS app end to end", async () => {
    // Self-contained probe target: no dependency on other commits.
    await executor.writeFiles("tmp-rea-probe", {
      "package.json": JSON.stringify({
        name: "rea-probe-app",
        version: "0.1.0",
        main: "src/index.js",
      }),
      "src/index.js":
        'const { add } = require("./math");\nmodule.exports = { main: () => add(1, 2) };\n',
      "src/math.js":
        "function add(a, b) { return a + b; }\nmodule.exports = { add };\n",
    });
    const record = await analyzeJavascriptApplication(
      executor,
      "tmp-rea-probe",
      { timeoutMs: 120000 },
    );
    expect(record.evidence_id).toMatch(/^ev_[0-9a-f]{64}$/);
    const evidence = reaEvidenceToLabEvidence(record);
    expect(evidence.id).toBe(record.evidence_id);
    expect(evidence.limitations.length).toBeGreaterThan(0);
  }, 150000);

  it("checkReadiness surfaces the real `rea doctor` report", async () => {
    // Default timeout (180s): the npx path can take ~75s under a scrubbed
    // env before `rea doctor` even starts (see rea.ts PERFORMANCE NOTE).
    const readiness = await checkReadiness(executor);
    expect(readiness.ok).toBe(true);
    // Zero-engine surface: node/host healthy, native engines missing.
    // The report is surfaced verbatim for the caller to interpret.
    expect(readiness.output).toContain("scope_checks");
    expect(typeof readiness.healthy).toBe("boolean");
  }, 240000);

  it("REA_BIN bypasses npx (fast path for pre-installed rea-agents)", async () => {
    // Resolve the real installed binary from the npx cache; skip honestly
    // when rea-agents was never installed on this machine.
    const { readdirSync, existsSync } = await import("node:fs");
    const npxCache = join(process.env.HOME ?? "", ".npm", "_npx");
    let reaBin: string | null = null;
    if (existsSync(npxCache)) {
      for (const entry of readdirSync(npxCache)) {
        const candidate = join(
          npxCache,
          entry,
          "node_modules",
          "rea-agents",
          "scripts",
          "rea.mjs",
        );
        if (existsSync(candidate)) {
          reaBin = candidate;
          break;
        }
      }
    }
    if (!reaBin) {
      console.log("SKIP: rea-agents not found in npx cache");
      return;
    }
    const startedAt = Date.now();
    const record = await analyzeJavascriptApplication(executor, ".", {
      timeoutMs: 120000,
      env: { REA_BIN: reaBin },
    });
    const elapsed = Date.now() - startedAt;
    expect(record.evidence_id).toMatch(/^ev_[0-9a-f]{64}$/);
    // Direct invocation must dodge the ~70s npx penalty (generous bound).
    expect(elapsed).toBeLessThan(60000);
  }, 150000);

  it("a failing REA invocation throws ReaError (never fake success)", async () => {
    await expect(
      runReaJsonCommand(executor, "analyze-javascript-application", [
        "samples/does-not-exist",
      ]),
    ).rejects.toThrow(ReaError);
  }, 90000);
});
