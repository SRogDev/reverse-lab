import { describe, expect, it } from "vitest";
import { POST as addTarget } from "../../../projects/[id]/targets/route";
import { POST as createProject } from "../../../projects/route";
import { params, postJson, setupIsolatedDataDir } from "../../../test-utils";
import { POST as startInvestigation } from "../../route";
import { POST } from "./route";

setupIsolatedDataDir();

async function makeRun(): Promise<{ projectId: string; runId: string }> {
  const projectRes = await createProject(
    postJson("http://localhost/api/projects", { name: "p", objective: "o" }),
  );
  const projectBody = (await projectRes.json()) as { project: { id: string } };
  await addTarget(
    postJson(
      `http://localhost/api/projects/${projectBody.project.id}/targets`,
      {
        kind: "component",
        ref: "data/app.sqlite",
      },
    ),
    params(projectBody.project.id),
  );
  const runRes = await startInvestigation(
    postJson("http://localhost/api/investigations", {
      projectId: projectBody.project.id,
    }),
  );
  const runBody = (await runRes.json()) as { run: { id: string } };
  return { projectId: projectBody.project.id, runId: runBody.run.id };
}

describe("POST /api/investigations/[id]/continue", () => {
  it("appends planned steps from the instruction", async () => {
    const { runId } = await makeRun();
    const res = await POST(
      postJson(`http://localhost/api/investigations/${runId}/continue`, {
        instruction: "also check the sqlite database at data/app.sqlite",
      }),
      params(runId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: { plan: { title: string }[]; status: string };
    };
    expect(body.run.status).toBe("running");
    expect(body.run.plan.map((s) => s.title).join("\n")).toMatch(/rea-sqlite/i);
  });

  it("rejects an empty instruction with 400", async () => {
    const { runId } = await makeRun();
    const res = await POST(
      postJson(`http://localhost/api/investigations/${runId}/continue`, {
        instruction: "  ",
      }),
      params(runId),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown investigation", async () => {
    const res = await POST(
      postJson("http://localhost/api/investigations/nope/continue", {
        instruction: "do more",
      }),
      params("nope"),
    );
    expect(res.status).toBe(404);
  });
});
