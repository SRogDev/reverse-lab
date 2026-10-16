/**
 * MCP smoke test: `npm run mcp:smoke`.
 *
 * Spawns `src/mcp/server.ts` as a child process over stdio and drives all
 * 7 tools in sequence with a REAL MCP client from the SDK
 * (`Client` + `StdioClientTransport` — no hand-rolled JSON-RPC).
 *
 * Sequence: create_research_project → start_investigation →
 * get_investigation_status → get_investigation_results →
 * list_research_findings → get_experiment_results →
 * continue_investigation.
 *
 * No keys, no network. The FileStore points at a fresh tmpdir
 * (REVERSE_LAB_DATA_DIR), so the smoke never touches real data.
 *
 * NOTE: no tool creates experiments yet (out of the 7-tool scope), so the
 * experiment for `get_experiment_results` is seeded directly through the
 * Store interface — the same interface the tools use. That seeding is
 * printed in the transcript.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FileStore } from "../evidence/store.ts";

interface Step {
  tool: string;
  args: () => Record<string, unknown>;
  summary: (result: Record<string, unknown>) => string;
}

function transcript(): string[] {
  return [];
}

function log(lines: string[], line: string): void {
  lines.push(line);
  console.log(line);
}

function getStructured(result: unknown): Record<string, unknown> {
  const r = result as {
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
    content?: { text?: string }[];
  };
  if (r.isError) {
    throw new Error(`tool returned isError: ${r.content?.[0]?.text ?? ""}`);
  }
  return r.structuredContent ?? {};
}

async function main(): Promise<void> {
  const lines = transcript();
  const dataDir = await mkdtemp(join(tmpdir(), "rl-mcp-smoke-"));
  log(lines, `== Reverse Lab MCP smoke ==`);
  log(lines, `data dir: ${dataDir}`);

  const transport = new StdioClientTransport({
    command: "node",
    args: ["--no-warnings", "src/mcp/server.ts"],
    env: { ...process.env, REVERSE_LAB_DATA_DIR: dataDir },
    stderr: "pipe",
  });
  const client = new Client({ name: "rl-mcp-smoke", version: "0.1.0" });
  await client.connect(transport);

  const toolsList = await client.listTools();
  log(
    lines,
    `server exposes ${toolsList.tools.length} tools: ${toolsList.tools.map((t) => t.name).join(", ")}`,
  );

  const ctx: Record<string, string> = {};

  const steps: Step[] = [
    {
      tool: "create_research_project",
      args: () => ({
        name: "smoke-demo",
        objective: "verify the MCP tool chain end to end",
        constraints: ["no external calls"],
      }),
      summary: (r) => {
        const project = r.project as { id: string; name: string };
        ctx.projectId = project.id;
        return `project "${project.name}" created (id ${project.id.slice(0, 8)}…)`;
      },
    },
    {
      tool: "start_investigation",
      args: () => ({ projectId: ctx.projectId }),
      summary: (r) => {
        const run = r.run as { id: string; status: string; objective: string };
        ctx.investigationId = run.id;
        return `run ${run.id.slice(0, 8)}… status=${run.status} objective="${run.objective}"`;
      },
    },
    {
      tool: "get_investigation_status",
      args: () => ({ investigationId: ctx.investigationId }),
      summary: (r) => {
        const run = r.run as { status: string; plan: unknown[] };
        return `status=${run.status}, plan steps=${run.plan.length}`;
      },
    },
    {
      tool: "get_investigation_results",
      args: () => ({ investigationId: ctx.investigationId }),
      summary: (r) => {
        const findings = r.findings as {
          evidence_ids: string[];
          limitations: string[];
        }[];
        return (
          `findings=${findings.length} evidence=${(r.evidence as unknown[]).length} ` +
          `hypotheses=${(r.hypotheses as unknown[]).length} conclusions=${(r.conclusions as unknown[]).length} ` +
          `first finding: evidence_ids=${JSON.stringify(findings[0]?.evidence_ids ?? [])} ` +
          `limitations=${JSON.stringify(findings[0]?.limitations ?? [])}`
        );
      },
    },
    {
      tool: "list_research_findings",
      args: () => ({ investigationId: ctx.investigationId }),
      summary: (r) => `findings=${(r.findings as unknown[]).length}`,
    },
    {
      tool: "get_experiment_results",
      args: () => ({ experimentId: ctx.experimentId }),
      summary: (r) => {
        const exp = r.experiment as { objective: string };
        return `experiment "${exp.objective}" runs=${(r.runs as unknown[]).length}`;
      },
    },
    {
      tool: "continue_investigation",
      args: () => ({
        investigationId: ctx.investigationId,
        instruction: "extend the smoke probe to the evidence pipeline",
      }),
      summary: (r) => {
        const run = r.run as {
          status: string;
          plan: { title: string; status: string }[];
        };
        const last = run.plan.at(-1);
        return `status=${run.status} last step="${last?.title}" (${last?.status})`;
      },
    },
  ];

  for (const [i, step] of steps.entries()) {
    if (step.tool === "get_experiment_results" && !ctx.experimentId) {
      // No tool creates experiments (out of the 7-tool scope): seed one
      // directly through the Store interface the tools themselves use.
      const seed = new FileStore({ dataDir });
      const spec = await seed.createExperiment(ctx.investigationId, {
        objective: "measure smoke latency",
        reference: { artifactId: "smoke" },
        procedure: ["run smoke"],
        measurements: ["elapsed_ms"],
        repetitions: 1,
        acceptance: "completes",
      });
      const run = await seed.addExperimentRun(spec.id, {
        notes: "seeded for smoke",
        environment: { seeded: true },
      });
      await seed.updateExperimentRun(run.id, {
        status: "completed",
        rawValues: { elapsed_ms: [42] },
      });
      ctx.experimentId = spec.id;
      log(
        lines,
        `-- seeded experiment ${spec.id.slice(0, 8)}… via Store (no tool covers creation yet)`,
      );
    }
    // Seed evidence before get_investigation_results so the transcript shows
    // the evidence_ids + limitations rule in action.
    if (step.tool === "get_investigation_results" && !ctx.seeded) {
      const seed = new FileStore({ dataDir });
      const evidence = await seed.addEvidence(ctx.investigationId, {
        type: "observation",
        source: "mcp-smoke",
        observation: "smoke tool chain executed without errors",
        limitations: ["seeded by the smoke script itself"],
        verification: "observed",
        provenance: { seeded: true },
      });
      await seed.addFinding(ctx.investigationId, {
        title: "MCP tool chain works",
        body: "all 7 tools executed against FileStore",
        evidenceIds: [evidence.id],
      });
      ctx.seeded = "1";
      log(
        lines,
        `-- seeded 1 evidence + 1 finding via Store (no tool covers creation yet)`,
      );
    }
    const result = await client.callTool({
      name: step.tool,
      arguments: step.args(),
    });
    const structured = getStructured(result);
    log(lines, `[${i + 1}/7] ${step.tool} → ${step.summary(structured)}`);
  }

  // A bad call must surface as an MCP error, not a crash.
  const bad = (await client.callTool({
    name: "get_investigation_status",
    arguments: { investigationId: "does-not-exist" },
  })) as { isError?: boolean };
  if (!bad.isError) {
    throw new Error("expected isError for unknown investigation");
  }
  log(
    lines,
    `[8/7] get_investigation_status (unknown id) → isError, as expected`,
  );

  await client.close();
  log(lines, `== smoke OK ==`);
}

main().catch((err: unknown) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
