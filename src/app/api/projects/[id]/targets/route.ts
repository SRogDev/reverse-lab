import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { readJsonBody, toErrorResponse } from "../../../errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await readJsonBody(request)) as
    | { kind?: unknown; ref?: unknown }
    | undefined;
  if (body === undefined) {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const target = await getServices().addTarget(id, {
      kind: body.kind as string,
      ref: body.ref as string,
    });
    return NextResponse.json({ target }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
