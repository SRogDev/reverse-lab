import { describe, expect, it } from "vitest";
import { POST as createProject } from "../../../projects/route";
import { params, postJson, setupIsolatedDataDir } from "../../../test-utils";
import { POST as startInvestigation } from "../../route";
import { POST } from "./route";

setupIsolatedDataDir();

async function makeRun(): Promise<string> {
  const projectRes = await createProject(
    postJson("http://localhost/api/projects", { name: "p", objective: "o" }),
  );
  const projectBody = (await projectRes.json()) as { project: { id: string } };
  // No targets: the plan has only internal steps (no REA, no tsc), so
  // advancing stays fast and hermetic in route tests.
  const runRes = await startInvestigation(
    postJson("http://localhost/api/investigations", {
      projectId: projectBody.project.id,
      objective: "understand how the mini-kv store works",
    }),
  );
  const runBody = (await runRes.json()) as { run: { id: string } };
  return runBody.run.id;
}

describe("POST /api/investigations/[id]/advance", () => {
  it("advances all pending steps to completion", async () => {
    const runId = await makeRun();
    const res = await POST(
      postJson(`http://localhost/api/investigations/${runId}/advance`, {}),
      params(runId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: { status: string; plan: { status: string }[] };
    };
    expect(body.run.status).toBe("completed");
    expect(body.run.plan.every((s) => s.status === "completed")).toBe(true);
  });

  it("honors maxSteps", async () => {
    const runId = await makeRun();
    const res = await POST(
      postJson(`http://localhost/api/investigations/${runId}/advance`, {
        maxSteps: 1,
      }),
      params(runId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: { status: string; plan: { status: string }[] };
    };
    expect(body.run.plan.filter((s) => s.status === "completed")).toHaveLength(
      1,
    );
    expect(body.run.status).toBe("running");
  });

  it("rejects an invalid maxSteps with 400", async () => {
    const runId = await makeRun();
    const res = await POST(
      postJson(`http://localhost/api/investigations/${runId}/advance`, {
        maxSteps: 0,
      }),
      params(runId),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown investigation", async () => {
    const res = await POST(
      postJson("http://localhost/api/investigations/nope/advance", {}),
      params("nope"),
    );
    expect(res.status).toBe(404);
  });
});
