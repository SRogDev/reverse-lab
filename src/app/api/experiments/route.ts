import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { readJsonBody, toErrorResponse } from "../errors";

export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as
    | { investigationId?: unknown; spec?: unknown }
    | undefined;
  if (body === undefined) {
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
  const spec = body.spec as
    | {
        objective?: unknown;
        hypothesisId?: unknown;
        reference?: unknown;
        alternative?: unknown;
        procedure?: unknown;
        measurements?: unknown;
        repetitions?: unknown;
        acceptance?: unknown;
      }
    | undefined;
  if (typeof spec !== "object" || spec === null) {
    return NextResponse.json(
      {
        error:
          "spec must include objective, reference.artifactId, procedure[], measurements[], repetitions and acceptance",
      },
      { status: 400 },
    );
  }
  try {
    const experiment = await getServices().createExperiment(
      body.investigationId,
      {
        objective: spec.objective as string,
        hypothesisId: spec.hypothesisId as string | undefined,
        reference: spec.reference as { artifactId: string },
        alternative: spec.alternative as { artifactId: string } | undefined,
        procedure: spec.procedure as string[],
        measurements: spec.measurements as string[],
        repetitions: spec.repetitions as number,
        acceptance: spec.acceptance as string,
      },
    );
    return NextResponse.json({ experiment }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
