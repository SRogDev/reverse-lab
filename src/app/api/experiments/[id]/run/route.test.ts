import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getStore } from "@/lib/store";
import { POST as startInvestigation } from "../../../investigations/route";
import { POST as createProject } from "../../../projects/route";
import { params, postJson, setupIsolatedDataDir } from "../../../test-utils";
import { POST as createExperiment } from "../../route";
import { POST } from "./route";

setupIsolatedDataDir();

async function makeExperiment(): Promise<string> {
  const projectRes = await createProject(
    postJson("http://localhost/api/projects", { name: "p", objective: "o" }),
  );
  const projectBody = (await projectRes.json()) as { project: { id: string } };
  const runRes = await startInvestigation(
    postJson("http://localhost/api/investigations", {
      projectId: projectBody.project.id,
    }),
  );
  const runBody = (await runRes.json()) as { run: { id: string } };
  // The real KV harness needs a real KV artifact: the repo's own mini-kv.
  const artifact = await getStore().addArtifact(runBody.run.id, {
    kind: "implementation",
    path: join(process.cwd(), "samples", "mini-kv", "dist", "index.js"),
    description: "reference mini-kv",
  });
  const expRes = await createExperiment(
    postJson("http://localhost/api/experiments", {
      investigationId: runBody.run.id,
      spec: {
        objective: "smoke",
        reference: { artifactId: artifact.id },
        procedure: ["run kv harness"],
        measurements: ["wall_time_ms", "correctness"],
        repetitions: 2,
        acceptance: "runs",
      },
    }),
  );
  const expBody = (await expRes.json()) as { experiment: { id: string } };
  return expBody.experiment.id;
}

describe("POST /api/experiments/[id]/run", () => {
  it("executes the experiment and records real measurements", async () => {
    const experimentId = await makeExperiment();
    const res = await POST(
      new Request(`http://localhost/api/experiments/${experimentId}/run`, {
        method: "POST",
      }),
      params(experimentId),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      run: {
        status: string;
        rawValues: Record<string, number[]>;
        environment: Record<string, unknown>;
        failures: string[];
      };
    };
    expect(body.run.status).toBe("completed");
    expect(body.run.rawValues["reference.wall_time_ms"]).toHaveLength(2);
    expect(body.run.rawValues["reference.correctness"]).toEqual([1, 1]);
    expect(body.run.environment.nodeVersion).toBe(process.version);
    expect(body.run.failures).toEqual([]);
  });

  it("returns 404 for an unknown experiment", async () => {
    const res = await POST(
      new Request("http://localhost/api/experiments/nope/run", {
        method: "POST",
      }),
      params("nope"),
    );
    expect(res.status).toBe(404);
  });
});
