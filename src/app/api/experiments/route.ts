import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validSpec(spec: unknown): spec is {
  objective: string;
  reference: { artifactId: string };
  procedure: string[];
  measurements: string[];
  repetitions: number;
  acceptance: string;
  hypothesisId?: string;
  alternative?: { artifactId: string };
} {
  if (!isRecord(spec)) {
    return false;
  }
  return (
    typeof spec.objective === "string" &&
    spec.objective.trim() !== "" &&
    isRecord(spec.reference) &&
    typeof spec.reference.artifactId === "string" &&
    Array.isArray(spec.procedure) &&
    Array.isArray(spec.measurements) &&
    typeof spec.repetitions === "number" &&
    typeof spec.acceptance === "string"
  );
}

export async function POST(request: Request) {
  let body: { investigationId?: unknown; spec?: unknown };
  try {
    body = (await request.json()) as {
      investigationId?: unknown;
      spec?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (
    typeof body.investigationId !== "string" ||
    body.investigationId.trim() === ""
  ) {
    return NextResponse.json(
      { error: "investigationId is required" },
      { status: 400 },
    );
  }
  const store = getStore();
  const run = await store.getRun(body.investigationId);
  if (!run) {
    return NextResponse.json(
      { error: "investigation not found" },
      { status: 404 },
    );
  }
  if (!validSpec(body.spec)) {
    return NextResponse.json(
      {
        error:
          "spec must include objective, reference.artifactId, procedure[], measurements[], repetitions and acceptance",
      },
      { status: 400 },
    );
  }
  // Recording the spec is real store work; executing it needs the engine.
  const experiment = await store.createExperiment(run.id, {
    objective: body.spec.objective.trim(),
    ...(typeof body.spec.hypothesisId === "string"
      ? { hypothesisId: body.spec.hypothesisId }
      : {}),
    reference: { artifactId: body.spec.reference.artifactId },
    ...(isRecord(body.spec.alternative) &&
    typeof body.spec.alternative.artifactId === "string"
      ? { alternative: { artifactId: body.spec.alternative.artifactId } }
      : {}),
    procedure: body.spec.procedure.filter(
      (p): p is string => typeof p === "string",
    ),
    measurements: body.spec.measurements.filter(
      (m): m is string => typeof m === "string",
    ),
    repetitions: body.spec.repetitions,
    acceptance: body.spec.acceptance,
  });
  return NextResponse.json({ experiment }, { status: 201 });
}
