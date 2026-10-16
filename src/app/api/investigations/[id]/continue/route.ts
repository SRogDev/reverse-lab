import { NextResponse } from "next/server";
import { getServices } from "@/services/lab";
import { readJsonBody, toErrorResponse } from "../../../errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await readJsonBody(request)) as
    | { instruction?: unknown }
    | undefined;
  if (body === undefined) {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  try {
    const run = await getServices().continueInvestigation(
      id,
      body.instruction as string,
    );
    return NextResponse.json({ run });
  } catch (err) {
    return toErrorResponse(err);
  }
}
