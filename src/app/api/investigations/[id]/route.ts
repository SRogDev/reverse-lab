import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const run = await getStore().getRun(id);
  if (!run) {
    return NextResponse.json(
      { error: "investigation not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({ run });
}
