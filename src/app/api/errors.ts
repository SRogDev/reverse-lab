/**
 * Shared error mapping for API routes: ServiceError carries its HTTP
 * status; anything else is a 500 (logged server-side, generic client-side).
 */
import { NextResponse } from "next/server";
import { ServiceError } from "@/services/lab";

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("unhandled route error", err);
  return NextResponse.json({ error: "internal error" }, { status: 500 });
}

/** Parse a JSON body, returning undefined on invalid JSON. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
