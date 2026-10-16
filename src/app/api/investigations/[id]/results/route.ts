import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const run = await store.getRun(id);
  if (!run) {
    return NextResponse.json(
      { error: "investigation not found" },
      { status: 404 },
    );
  }
  const [findings, evidence, hypotheses, conclusions] = await Promise.all([
    store.listFindings(id),
    store.listEvidence(id),
    store.listHypotheses(id),
    store.listConclusions(id),
  ]);
  return NextResponse.json({ findings, evidence, hypotheses, conclusions });
}
