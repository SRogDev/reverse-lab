import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { readJsonBody, toErrorResponse } from "../errors";

export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as
    | { projectId?: unknown; objective?: unknown }
    | undefined;
  if (body === undefined) {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.projectId !== "string" || body.projectId.trim() === "") {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }
  try {
    // Starting the investigation now plans and runs it (Phase 3 engine):
    // the run comes back with its plan persisted and status "running".
    const run = await getServices().startInvestigation(
      body.projectId,
      typeof body.objective === "string" ? body.objective : undefined,
    );
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
