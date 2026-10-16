import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { toErrorResponse } from "../../errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const details = await getServices().getProjectDetails(id);
    return NextResponse.json(details);
  } catch (err) {
    return toErrorResponse(err);
  }
}
