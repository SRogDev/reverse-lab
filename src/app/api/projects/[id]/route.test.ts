import { describe, expect, it } from "vitest";
import { get, params, postJson, setupIsolatedDataDir } from "../../test-utils";
import { POST as createProject } from "../route";
import { GET } from "./route";

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

describe("GET /api/projects/[id]", () => {
  it("returns the project with its targets and runs", async () => {
    const id = await makeProject();
    const res = await GET(get("http://localhost/api/projects/x"), params(id));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { id: string };
      targets: unknown[];
      runs: unknown[];
    };
    expect(body.project.id).toBe(id);
    expect(body.targets).toEqual([]);
    expect(body.runs).toEqual([]);
  });

  it("returns 404 for an unknown project", async () => {
    const res = await GET(
      get("http://localhost/api/projects/x"),
      params("missing"),
    );
    expect(res.status).toBe(404);
  });
});
