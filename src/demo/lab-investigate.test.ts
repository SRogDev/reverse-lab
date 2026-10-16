/**
 * INTEGRATION TEST (labeled): the full lab:investigate demo.
 *
 * This runs the REAL pipeline with zero keys: the real REA CLI (via
 * REA_BIN), real tsc compilation of the generated alternative, and the
 * real benchmark harness collecting measurements x repetitions. It is
 * slow (~1-3 minutes) and is the honest proof the demo works — not a mock.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDemo } from "./lab-investigate";

describe("lab:investigate demo (integration: real REA + tsc + measurements)", () => {
  it("investigates mini-kv TTL end to end and compares a real alternative", {
    timeout: 600_000,
  }, async () => {
    const repoRoot = process.cwd();
    const dataDir = mkdtempSync(join(tmpdir(), "lab-demo-test-"));
    const summary = await runDemo({
      objective:
        "Investigate the mini-kv TTL implementation and build a simpler alternative",
      target: "samples/mini-kv",
      repoRoot,
      dataDir,
      reaBin: join(
        repoRoot,
        "node_modules",
        "rea-agents",
        "scripts",
        "rea.mjs",
      ),
    });

    expect(summary.error).toBeUndefined();
    expect(summary.status).toBe("completed");
    // Real REA evidence: content-addressed ev_<sha256>.
    expect(summary.evidenceIds.some((id) => /^ev_[0-9a-f]{64}$/.test(id))).toBe(
      true,
    );
    // Hypotheses were recorded as hypotheses.
    expect(summary.hypotheses.length).toBeGreaterThan(0);
    expect(summary.hypotheses.every((h) => h.status === "proposed")).toBe(true);
    // Real measurements: 5 repetitions for both variants.
    expect(summary.comparisons.length).toBe(2);
    const wall = summary.comparisons.find(
      (c) => c.measurement === "wall_time_ms",
    );
    expect(wall?.reference.n).toBe(5);
    expect(wall?.alternative?.n).toBe(5);
    expect(typeof wall?.deltaVsReference).toBe("number");
    const correctness = summary.comparisons.find(
      (c) => c.measurement === "correctness",
    );
    expect(correctness?.reference.mean).toBe(1);
    // Conclusions exist and cite evidence.
    expect(summary.conclusions.length).toBeGreaterThan(0);
    expect(summary.conclusions.every((c) => c.evidenceIds.length > 0)).toBe(
      true,
    );
    // No hidden failures.
    expect(summary.failures).toEqual([]);
  });
});
