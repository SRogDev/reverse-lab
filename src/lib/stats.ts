/**
 * Measurement statistics for the Knowledge Space comparison table.
 *
 * Computed exclusively from an experiment run's `rawValues` — mean, min, max
 * and n of the *recorded* samples. No invented scores: when there are no
 * samples the summary is null and the UI renders an honest empty state.
 */

export interface ValueSummary {
  mean: number;
  min: number;
  max: number;
  n: number;
}

/** Summarize one metric's samples. Returns null for empty input. */
export function summarizeValues(values: number[]): ValueSummary | null {
  if (values.length === 0) {
    return null;
  }
  let sum = 0;
  let min = values[0];
  let max = values[0];
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { mean: sum / values.length, min, max, n: values.length };
}

/**
 * Relative position of the mean inside the global [min,max] band, for the
 * measurement bars. Returns 0 when the band collapses.
 */
export function meanPosition(
  summary: ValueSummary,
  bandMin: number,
  bandMax: number,
): number {
  if (bandMax <= bandMin) {
    return 0;
  }
  const clamped = Math.min(Math.max(summary.mean, bandMin), bandMax);
  return (clamped - bandMin) / (bandMax - bandMin);
}
