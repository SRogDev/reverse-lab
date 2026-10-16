/**
 * Tests for the MCP tool definitions (src/mcp/tools.ts).
 *
 * Thin-adapter rule: every tool calls the same `Store` interface the API
 * routes use. Tests seed that store directly (FileStore in a tmpdir) and
 * call the tool handlers — no network, no keys.
 */
import { describe, expect, it } from "vitest";
import { getStore } from "../lib/store";
import { setupIsolatedDataDir } from "../app/api/test-utils";
import { ToolError, toolDefinitions } from "./tools";

setupIsolatedDataDir();

function findTool(name: string) {
  const tool = toolDefinitions.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`tool not registered: ${name}`);
  }
  return tool;
}

async function execute(name: string, args: unknown): Promise<unknown> {
  return findTool(name).execute(getStore(), args);
}

describe("tool registry", () => {
  it("registers exactly the 7 documented tools", () => {
    const names = toolDefinitions.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "create_research_project",
        "continue_investigation",
        "get_experiment_results",
        "get_investigation_results",
        "get_investigation_status",
        "list_research_findings",
        "start_investigation",
      ].sort(),
    );
  });

  it("rejects bad input schemas", () => {
    expect(
      findTool("create_research_project").inputSchema.safeParse({}),
    ).toMatchObject({ success: false });
    expect(
      findTool("create_research_project").inputSchema.safeParse({
        name: "",
        objective: "ok",
      }),
    ).toMatchObject({ success: false });
    expect(
      findTool("start_investigation").inputSchema.safeParse({}),
    ).toMatchObject({ success: false });
    expect(
      findTool("continue_investigation").inputSchema.safeParse({
        investigationId: "x",
        instruction: "",
      }),
    ).toMatchObject({ success: false });
    expect(
      findTool("list_research_findings").inputSchema.safeParse({
        investigationId: "x",
        status: "bogus",
      }),
    ).toMatchObject({ success: false });
  });
});

async function makeProject(): Promise<{ id: string; objective: string }> {
  const result = (await execute("create_research_project", {
    name: "mini-kv study",
    objective: "understand the mini-kv write path",
    constraints: ["no writes to the repo"],
  })) as { project: { id: string; objective: string } };
  return result.project;
}

describe("create_research_project", () => {
  it("creates a project and returns it", async () => {
    const result = (await execute("create_research_project", {
      name: "p",
      objective: "o",
    })) as { project: { name: string; constraints: string[] } };
    expect(result.project.name).toBe("p");
    expect(result.project.constraints).toEqual([]);
  });
});

describe("start_investigation", () => {
  it("creates a pending run, defaulting objective to the project's", async () => {
    const project = await makeProject();
    const result = (await execute("start_investigation", {
      projectId: project.id,
    })) as { run: { projectId: string; objective: string; status: string } };
    expect(result.run.projectId).toBe(project.id);
    expect(result.run.objective).toBe(project.objective);
    expect(result.run.status).toBe("pending");
  });

  it("throws ToolError for an unknown project", async () => {
    await expect(
      execute("start_investigation", { projectId: "missing" }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("get_investigation_status", () => {
  it("returns status, currentStep and plan", async () => {
    const project = await makeProject();
    const started = (await execute("start_investigation", {
      projectId: project.id,
      objective: "probe the write path",
    })) as { run: { id: string } };
    const result = (await execute("get_investigation_status", {
      investigationId: started.run.id,
    })) as { run: { status: string; plan: unknown[] } };
    expect(result.run.status).toBe("pending");
    expect(Array.isArray(result.run.plan)).toBe(true);
  });

  it("throws ToolError for an unknown investigation", async () => {
    await expect(
      execute("get_investigation_status", { investigationId: "missing" }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("get_investigation_results and list_research_findings", () => {
  async function seedRun(): Promise<string> {
    const project = await makeProject();
    const started = (await execute("start_investigation", {
      projectId: project.id,
    })) as { run: { id: string } };
    const runId = started.run.id;
    const store = getStore();
    const evidence = await store.addEvidence(runId, {
      type: "observation",
      source: "rea",
      observation: "write() calls fsync before returning",
      limitations: ["observed on Linux only"],
      verification: "observed",
      provenance: { seeded: true },
    });
    await store.addFinding(runId, {
      title: "writes are durable",
      body: "write() fsyncs before returning",
      evidenceIds: [evidence.id],
    });
    await store.addHypothesis(runId, {
      statement: "reads also hit disk",
      evidenceIds: [],
    });
    await store.addConclusion(runId, {
      statement: "the write path is durable on Linux",
      evidenceIds: [evidence.id],
      limitations: ["only the write path was measured"],
    });
    return runId;
  }

  it("returns findings, evidence, hypotheses and conclusions", async () => {
    const runId = await seedRun();
    const result = (await execute("get_investigation_results", {
      investigationId: runId,
    })) as {
      findings: { title: string }[];
      evidence: { observation: string }[];
      hypotheses: { statement: string }[];
      conclusions: { statement: string }[];
    };
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe("writes are durable");
    expect(result.evidence[0]?.observation).toBe(
      "write() calls fsync before returning",
    );
    expect(result.hypotheses).toHaveLength(1);
    expect(result.conclusions).toHaveLength(1);
  });

  it("attaches evidence_ids and limitations to every finding", async () => {
    const runId = await seedRun();
    const result = (await execute("get_investigation_results", {
      investigationId: runId,
    })) as {
      findings: { evidence_ids: string[]; limitations: string[] }[];
      evidence: { id: string }[];
    };
    const finding = result.findings[0];
    expect(finding).toBeDefined();
    expect(finding?.evidence_ids).toEqual([result.evidence[0]?.id]);
    expect(finding?.limitations).toContain("observed on Linux only");
  });

  it("throws ToolError for an unknown investigation", async () => {
    await expect(
      execute("get_investigation_results", { investigationId: "missing" }),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("list_research_findings filters by status", async () => {
    const runId = await seedRun();
    const store = getStore();
    const findings = await store.listFindings(runId);
    await store.updateFindingStatus(findings[0]?.id ?? "", "confirmed");
    const result = (await execute("list_research_findings", {
      investigationId: runId,
      status: "confirmed",
    })) as { findings: unknown[] };
    expect(result.findings).toHaveLength(1);
    const empty = (await execute("list_research_findings", {
      investigationId: runId,
      status: "refuted",
    })) as { findings: unknown[] };
    expect(empty.findings).toHaveLength(0);
  });
});

describe("get_experiment_results", () => {
  it("returns the experiment and its runs", async () => {
    const project = await makeProject();
    const started = (await execute("start_investigation", {
      projectId: project.id,
    })) as { run: { id: string } };
    const store = getStore();
    const spec = await store.createExperiment(started.run.id, {
      objective: "measure write latency",
      reference: { artifactId: "mini-kv" },
      procedure: ["run benchmark 10x"],
      measurements: ["p99 write latency"],
      repetitions: 10,
      acceptance: "p99 < 10ms",
    });
    await store.addExperimentRun(spec.id, { notes: "baseline" });
    const result = (await execute("get_experiment_results", {
      experimentId: spec.id,
    })) as {
      experiment: { id: string };
      runs: { notes?: string }[];
    };
    expect(result.experiment.id).toBe(spec.id);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]?.notes).toBe("baseline");
  });

  it("throws ToolError for an unknown experiment", async () => {
    await expect(
      execute("get_experiment_results", { experimentId: "missing" }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("continue_investigation", () => {
  it("records the instruction as a pending plan step and marks the run running", async () => {
    const project = await makeProject();
    const started = (await execute("start_investigation", {
      projectId: project.id,
    })) as { run: { id: string } };
    const result = (await execute("continue_investigation", {
      investigationId: started.run.id,
      instruction: "also probe the read path",
    })) as {
      run: {
        status: string;
        plan: { title: string; status: string }[];
      };
    };
    expect(result.run.status).toBe("running");
    const step = result.run.plan.at(-1);
    expect(step?.title).toBe("also probe the read path");
    expect(step?.status).toBe("pending");
  });

  it("throws ToolError for an unknown investigation", async () => {
    await expect(
      execute("continue_investigation", {
        investigationId: "missing",
        instruction: "go",
      }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
