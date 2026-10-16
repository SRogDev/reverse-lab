import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import type { ResearchTargetKind } from "@/types";

const KINDS: ResearchTargetKind[] = [
  "repo",
  "component",
  "feature",
  "product",
  "docs",
  "article",
  "benchmark",
  "experiment",
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const store = getStore();
  const project = await store.getProject(id);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  let body: { kind?: unknown; ref?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; ref?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!KINDS.includes(body.kind as ResearchTargetKind)) {
    return NextResponse.json(
      { error: `kind must be one of: ${KINDS.join(", ")}` },
      { status: 400 },
    );
  }
  if (typeof body.ref !== "string" || body.ref.trim() === "") {
    return NextResponse.json({ error: "ref is required" }, { status: 400 });
  }
  const target = await store.createTarget({
    projectId: id,
    kind: body.kind as ResearchTargetKind,
    ref: body.ref.trim(),
  });
  return NextResponse.json({ target }, { status: 201 });
}
