import { describe, expect, it } from "vitest";
import { get, postJson, setupIsolatedDataDir } from "../test-utils";
import { GET, POST } from "./route";

setupIsolatedDataDir();

describe("POST /api/projects", () => {
  it("creates a project and returns it", async () => {
    const res = await POST(
      postJson("http://localhost/api/projects", {
        name: "mini-kv",
        objective: "understand TTL expiry",
        constraints: ["no network"],
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      project: { id: string; name: string; constraints: string[] };
    };
    expect(body.project.name).toBe("mini-kv");
    expect(body.project.constraints).toEqual(["no network"]);
    expect(body.project.id).not.toBe("");
  });

  it("defaults constraints to []", async () => {
    const res = await POST(
      postJson("http://localhost/api/projects", {
        name: "p",
        objective: "o",
      }),
    );
    const body = (await res.json()) as { project: { constraints: string[] } };
    expect(body.project.constraints).toEqual([]);
  });

  it("rejects missing name/objective with 400", async () => {
    const res = await POST(
      postJson("http://localhost/api/projects", { name: "p" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/objective/i);
  });
});

describe("GET /api/projects", () => {
  it("lists created projects", async () => {
    await POST(
      postJson("http://localhost/api/projects", { name: "a", objective: "oa" }),
    );
    await POST(
      postJson("http://localhost/api/projects", { name: "b", objective: "ob" }),
    );
    const res = await GET(get("http://localhost/api/projects"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projects: { name: string }[] };
    expect(body.projects.map((p) => p.name).sort()).toEqual(["a", "b"]);
  });
});
