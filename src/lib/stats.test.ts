/**
 * Unit tests for the measurement statistics behind the Knowledge Space
 * comparison table. The table must only ever show real recorded values —
 * these tests pin the math (mean/min/max/n) and the empty-input contract.
 */

import { describe, expect, it } from "vitest";
import type { ValueSummary } from "@/lib/stats";
import { meanPosition, summarizeValues } from "@/lib/stats";

/** Unwrap a summary or fail loudly — keeps the test honest about nulls. */
function mustSummarize(values: number[]): ValueSummary {
  const summary = summarizeValues(values);
  if (summary === null) {
    throw new Error("expected summarizeValues to return a summary");
  }
  return summary;
}

describe("summarizeValues", () => {
  it("computes mean, min, max, and n from raw samples", () => {
    const summary = summarizeValues([10, 20, 30, 40]);
    expect(summary).toEqual({ mean: 25, min: 10, max: 40, n: 4 });
  });

  it("handles a single sample without dividing by zero", () => {
    expect(summarizeValues([7])).toEqual({ mean: 7, min: 7, max: 7, n: 1 });
  });

  it("returns null for empty input — the UI must show an empty state", () => {
    expect(summarizeValues([])).toBeNull();
  });

  it("handles unsorted and negative values", () => {
    const summary = summarizeValues([3, -5, 12, 0]);
    expect(summary?.min).toBe(-5);
    expect(summary?.max).toBe(12);
    expect(summary?.mean).toBeCloseTo(2.5);
    expect(summary?.n).toBe(4);
  });
});

describe("meanPosition", () => {
  it("places the mean inside the global band", () => {
    const summary = mustSummarize([20, 40]);
    expect(meanPosition(summary, 0, 100)).toBeCloseTo(0.3);
  });

  it("returns 0 when the band collapses", () => {
    const summary = mustSummarize([5]);
    expect(meanPosition(summary, 5, 5)).toBe(0);
  });

  it("clamps an out-of-band mean", () => {
    const summary = mustSummarize([200]);
    expect(meanPosition(summary, 0, 100)).toBe(1);
  });
});
