import { describe, expect, it } from "vitest";
import { POST as createProject } from "../../../projects/route";
import {
  get,
  params,
  postJson,
  setupIsolatedDataDir,
} from "../../../test-utils";
import { POST as createInvestigation } from "../../route";
import { GET } from "./route";

setupIsolatedDataDir();

async function makeRun(): Promise<string> {
  const projectRes = await createProject(
    postJson("http://localhost/api/projects", { name: "p", objective: "o" }),
  );
  const projectBody = (await projectRes.json()) as { project: { id: string } };
  const runRes = await createInvestigation(
    postJson("http://localhost/api/investigations", {
      projectId: projectBody.project.id,
    }),
  );
  const runBody = (await runRes.json()) as { run: { id: string } };
  return runBody.run.id;
}

describe("GET /api/investigations/[id]/experiments", () => {
  it("returns the investigation's experiments", async () => {
    const id = await makeRun();
    const res = await GET(
      get("http://localhost/api/investigations/x/experiments"),
      params(id),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { experiments: unknown[] };
    expect(body.experiments).toEqual([]);
  });

  it("returns 404 for an unknown run", async () => {
    const res = await GET(
      get("http://localhost/api/investigations/x/experiments"),
      params("missing"),
    );
    expect(res.status).toBe(404);
  });
});
