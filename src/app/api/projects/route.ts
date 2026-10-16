import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const body = (await readJson(request)) as
    | {
        name?: unknown;
        objective?: unknown;
        constraints?: unknown;
      }
    | undefined;
  if (typeof body?.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof body.objective !== "string" || body.objective.trim() === "") {
    return NextResponse.json(
      { error: "objective is required" },
      { status: 400 },
    );
  }
  const constraints = Array.isArray(body.constraints)
    ? body.constraints.filter((c): c is string => typeof c === "string")
    : [];
  const project = await getStore().createProject({
    name: body.name.trim(),
    objective: body.objective.trim(),
    constraints,
  });
  return NextResponse.json({ project }, { status: 201 });
}

export async function GET(_request: Request) {
  const projects = await getStore().listProjects();
  return NextResponse.json({ projects });
}
