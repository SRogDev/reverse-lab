import { describe, expect, it } from "vitest";
import { POST as createProject } from "../projects/route";
import { postJson, setupIsolatedDataDir } from "../test-utils";
import { POST } from "./route";

setupIsolatedDataDir();

async function makeProject(): Promise<{ id: string; objective: string }> {
  const res = await createProject(
    postJson("http://localhost/api/projects", {
      name: "p",
      objective: "project objective",
    }),
  );
  const body = (await res.json()) as {
    project: { id: string; objective: string };
  };
  return body.project;
}

describe("POST /api/investigations", () => {
  it("creates an investigation run for the project", async () => {
    const project = await makeProject();
    const res = await POST(
      postJson("http://localhost/api/investigations", {
        projectId: project.id,
        objective: "custom objective",
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      run: {
        id: string;
        projectId: string;
        objective: string;
        status: string;
        plan: { id: string; title: string; status: string }[];
      };
    };
    expect(body.run.projectId).toBe(project.id);
    expect(body.run.objective).toBe("custom objective");
    // Phase 3: starting an investigation plans and starts it — the run
    // comes back with its plan persisted and status "running".
    expect(body.run.status).toBe("running");
    expect(body.run.plan.length).toBeGreaterThan(0);
  });

  it("defaults the run objective to the project's objective", async () => {
    const project = await makeProject();
    const res = await POST(
      postJson("http://localhost/api/investigations", {
        projectId: project.id,
      }),
    );
    const body = (await res.json()) as { run: { objective: string } };
    expect(body.run.objective).toBe("project objective");
  });

  it("returns 404 for an unknown project", async () => {
    const res = await POST(
      postJson("http://localhost/api/investigations", {
        projectId: "missing",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a missing projectId with 400", async () => {
    const res = await POST(postJson("http://localhost/api/investigations", {}));
    expect(res.status).toBe(400);
  });
});
