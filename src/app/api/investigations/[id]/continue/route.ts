import { NextResponse } from "next/server";

/**
 * Continuing an investigation with a new instruction needs the Phase 3
 * investigation engine (planning + orchestration). Honest 501 until then —
 * never a faked "continued" run.
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
