import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const project = await store.getProject(id);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  const [targets, runs] = await Promise.all([
    store.listTargets(id),
    store.listRuns(id),
  ]);
  return NextResponse.json({ project, targets, runs });
}
