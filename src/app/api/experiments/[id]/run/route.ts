import { NextResponse } from "next/server";

/**
 * Executing an experiment (isolated run + measurements) needs the Phase 3/4
 * engine. Honest 501 until then — no experimentRun record is created, so
 * nothing can be mistaken for an executed experiment.
 */
export async function POST(
  _request: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  return NextResponse.json(
    { error: "investigation engine not yet implemented" },
    { status: 501 },
  );
}
