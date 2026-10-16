import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { toErrorResponse } from "../../../errors";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { findings, evidence, hypotheses, conclusions } =
      await getServices().getInvestigationResults(id);
    return NextResponse.json({ findings, evidence, hypotheses, conclusions });
  } catch (err) {
    return toErrorResponse(err);
  }
}
