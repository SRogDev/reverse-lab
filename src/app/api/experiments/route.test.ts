import { describe, expect, it } from "vitest";
import { POST as createInvestigation } from "../investigations/route";
import { POST as createProject } from "../projects/route";
import { postJson, setupIsolatedDataDir } from "../test-utils";
import { POST } from "./route";

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

const validSpec = {
  objective: "compare expiry accuracy",
  reference: { artifactId: "ref" },
  procedure: ["insert", "sleep", "read"],
  measurements: ["expired"],
  repetitions: 5,
  acceptance: "agree on all runs",
};

describe("POST /api/experiments", () => {
  it("creates an experiment for the investigation", async () => {
    const runId = await makeRun();
    const res = await POST(
      postJson("http://localhost/api/experiments", {
        investigationId: runId,
        spec: validSpec,
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      experiment: { id: string; investigationId: string; objective: string };
    };
    expect(body.experiment.investigationId).toBe(runId);
    expect(body.experiment.objective).toBe("compare expiry accuracy");
  });

  it("rejects an incomplete spec with 400", async () => {
    const runId = await makeRun();
    const res = await POST(
      postJson("http://localhost/api/experiments", {
        investigationId: runId,
        spec: { objective: "x" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown investigation", async () => {
    const res = await POST(
      postJson("http://localhost/api/experiments", {
        investigationId: "missing",
        spec: validSpec,
      }),
    );
    expect(res.status).toBe(404);
  });
});
