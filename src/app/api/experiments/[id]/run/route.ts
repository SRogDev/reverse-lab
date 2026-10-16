import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { toErrorResponse } from "../../../errors";

/**
 * Execute an experiment spec in the sandbox executor: stages the
 * reference/alternative artifacts, runs the benchmark harness for
 * spec.repetitions, and records the ExperimentRun with full environment
 * context, rawValues, and failures.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const run = await getServices().runExperiment(id);
    return NextResponse.json({ run });
  } catch (err) {
    return toErrorResponse(err);
  }
}
