import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { toErrorResponse } from "../../errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const run = await getServices().getInvestigationStatus(id);
    return NextResponse.json({ run });
  } catch (err) {
    return toErrorResponse(err);
  }
}
