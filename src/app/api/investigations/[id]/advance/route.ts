import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { readJsonBody, toErrorResponse } from "../../../errors";

/**
 * POST /api/investigations/[id]/advance { maxSteps? }
 *
 * Executes up to maxSteps pending plan steps through the investigation
 * engine (default: all remaining). Returns the updated run: step statuses,
 * and — when nothing is pending anymore — status "completed". A step that
 * fails twice marks the run "failed" with the error visible; advancing a
 * failed run returns 409 (revise the plan or continue instead).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await readJsonBody(request)) as
    | { maxSteps?: unknown }
    | undefined;
  if (body === undefined) {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (
    body.maxSteps !== undefined &&
    (typeof body.maxSteps !== "number" ||
      !Number.isInteger(body.maxSteps) ||
      body.maxSteps < 1)
  ) {
    return NextResponse.json(
      { error: "maxSteps must be a positive integer" },
      { status: 400 },
    );
  }
  try {
    const run = await getServices().advanceInvestigation(id, {
      ...(typeof body.maxSteps === "number" ? { maxSteps: body.maxSteps } : {}),
    });
    return NextResponse.json({ run });
  } catch (err) {
    return toErrorResponse(err);
  }
}
