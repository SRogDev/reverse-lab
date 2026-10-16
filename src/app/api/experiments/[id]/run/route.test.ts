import { describe, expect, it } from "vitest";
import { params, setupIsolatedDataDir } from "../../../test-utils";
import { POST } from "./route";

setupIsolatedDataDir();

describe("POST /api/experiments/[id]/run", () => {
  it("returns an honest 501: execution needs the engine", async () => {
    const res = await POST(
      new Request("http://localhost/api/experiments/x/run", {
        method: "POST",
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
