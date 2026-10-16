import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function POST(request: Request) {
  let body: { projectId?: unknown; objective?: unknown };
  try {
    body = (await request.json()) as {
      projectId?: unknown;
      objective?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.projectId !== "string" || body.projectId.trim() === "") {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }
  const store = getStore();
  const project = await store.getProject(body.projectId);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  // Creating the run record is real store work; the autonomous investigation
  // itself starts when the Phase 3 engine exists (status stays "pending").
  const run = await store.createRun({
    projectId: project.id,
    objective:
      typeof body.objective === "string" && body.objective.trim() !== ""
        ? body.objective.trim()
        : project.objective,
  });
  return NextResponse.json({ run }, { status: 201 });
}
