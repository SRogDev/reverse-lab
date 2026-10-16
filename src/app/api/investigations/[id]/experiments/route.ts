import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { toErrorResponse } from "../../../errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { experiments } = await getServices().getInvestigationResults(id);
    return NextResponse.json({ experiments });
  } catch (err) {
    return toErrorResponse(err);
  }
}
