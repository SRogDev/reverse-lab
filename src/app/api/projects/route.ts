import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { readJsonBody, toErrorResponse } from "../errors";

export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as
    | { name?: unknown; objective?: unknown; constraints?: unknown }
    | undefined;
  try {
    const project = await getServices().createProject({
      name: body?.name as string,
      objective: body?.objective as string,
      constraints: body?.constraints as string[] | undefined,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function GET(_request: Request) {
  try {
    const projects = await getServices().listProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    return toErrorResponse(err);
  }
}
