import { describe, expect, it } from "vitest";
import { params, postJson, setupIsolatedDataDir } from "../../../test-utils";
import { POST as createProject } from "../../route";
import { POST } from "./route";

setupIsolatedDataDir();

async function makeProject(): Promise<string> {
  const res = await createProject(
    postJson("http://localhost/api/projects", {
      name: "p",
      objective: "o",
    }),
  );
  const body = (await res.json()) as { project: { id: string } };
  return body.project.id;
}

describe("POST /api/projects/[id]/targets", () => {
  it("creates a target for the project", async () => {
    const id = await makeProject();
    const res = await POST(
      postJson("http://localhost/api/projects/x/targets", {
        kind: "component",
        ref: "samples/mini-kv",
      }),
      params(id),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      target: { projectId: string; kind: string; ref: string };
    };
    expect(body.target.projectId).toBe(id);
    expect(body.target.kind).toBe("component");
    expect(body.target.ref).toBe("samples/mini-kv");
  });

  it("rejects an unknown target kind with 400", async () => {
    const id = await makeProject();
    const res = await POST(
      postJson("http://localhost/api/projects/x/targets", {
        kind: "spaceship",
        ref: "y",
      }),
      params(id),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown project", async () => {
    const res = await POST(
      postJson("http://localhost/api/projects/x/targets", {
        kind: "repo",
        ref: "y",
      }),
      params("missing"),
    );
    expect(res.status).toBe(404);
  });
});
