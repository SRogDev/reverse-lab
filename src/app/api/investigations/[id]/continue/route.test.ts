import { describe, expect, it } from "vitest";
import { params, postJson, setupIsolatedDataDir } from "../../../test-utils";
import { POST } from "./route";

setupIsolatedDataDir();

describe("POST /api/investigations/[id]/continue", () => {
  it("returns an honest 501: the engine is a later phase", async () => {
    const res = await POST(
      postJson("http://localhost/api/investigations/x/continue", {
        instruction: "focus on TTL",
      }),
      params("any-id"),
    );
    expect(res.status).toBe(501);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({
      error: "investigation engine not yet implemented",
    });
  });
});
