/**
 * MOCK FIXTURES for component smoke tests.
 *
 * These are NOT real data. They are shaped exactly like the real API
 * responses (see `src/app/api/*` route handlers and `src/types.ts`) so the
 * smoke tests exercise the views against the true contract:
 *
 *   GET  /api/projects                    → { projects }
 *   GET  /api/projects/[id]               → { project, targets, runs }
 *   POST /api/projects                    → { project }
 *   GET  /api/investigations/[id]         → { run }
 *   GET  /api/investigations/[id]/results → { findings, evidence, hypotheses, conclusions }
 *   GET  /api/investigations/[id]/experiments → { experiments }
 */

import { vi } from "vitest";
import type {
  CreateInvestigationResponse,
  CreateProjectResponse,
  ExperimentsResponse,
  InvestigationResponse,
  ProjectDetailResponse,
  ProjectsResponse,
  ResultsResponse,
} from "@/lib/api";
import type {
  Conclusion,
  Evidence,
  ExperimentSpec,
  Finding,
  Hypothesis,
  InvestigationRun,
  Project,
  ResearchTarget,
} from "@/types";

export const mockProject: Project = {
  id: "proj-test-1",
  name: "Billing-service latency",
  objective: "Find out why invoice rendering slows down 4x on large accounts.",
  constraints: ["read-only against production data"],
  createdAt: "2026-10-16T01:00:00.000Z",
  updatedAt: "2026-10-16T01:00:00.000Z",
};

export const mockProjectsResponse: ProjectsResponse = {
  projects: [mockProject],
};

export const mockTargets: ResearchTarget[] = [
  {
    id: "tgt-test-1",
    projectId: mockProject.id,
    kind: "repo",
    ref: "github.com/acme/billing",
    createdAt: "2026-10-16T01:05:00.000Z",
  },
];

export const mockRun: InvestigationRun = {
  id: "inv-test-1",
  projectId: mockProject.id,
  objective: mockProject.objective,
  status: "running",
  plan: [
    {
      id: "step-1",
      title: "Inspect invoice rendering path",
      status: "completed",
      detail: "Located renderInvoice in billing/src/render.ts",
    },
    {
      id: "step-2",
      title: "Profile large-account render",
      status: "running",
      detail: "Sampling wall time across 50 accounts",
    },
    { id: "step-3", title: "Propose alternative", status: "pending" },
  ],
  currentStep: "step-2",
  createdAt: "2026-10-16T01:10:00.000Z",
  updatedAt: "2026-10-16T01:12:00.000Z",
};

export const mockProjectDetail: ProjectDetailResponse = {
  project: mockProject,
  targets: mockTargets,
  runs: [mockRun],
};

export const mockCreateProject: CreateProjectResponse = {
  project: { ...mockProject, id: "proj-test-2", name: "Fresh project" },
};

export const mockCreateInvestigation: CreateInvestigationResponse = {
  run: { ...mockRun, id: "inv-test-2", status: "pending", plan: [] },
};

export const mockInvestigationResponse: InvestigationResponse = {
  run: mockRun,
};

export const mockEvidence: Evidence = {
  id: `lab-ev-${"a".repeat(64)}`,
  type: "profile",
  source: "sampling-profiler",
  observation:
    "renderInvoice spends 78% of wall time in formatLineItems on accounts with 500+ lines.",
  limitations: [
    "Sampled on a single machine; production hardware may differ.",
    "Profiler overhead estimated at ~3%, not subtracted.",
  ],
  verification: "measured",
  provenance: { tool: "sampling-profiler", samples: 1200 },
  createdAt: "2026-10-16T01:20:00.000Z",
};

export const mockFinding: Finding = {
  id: "find-test-1",
  investigationId: mockRun.id,
  title: "Line-item formatting dominates render cost",
  body: "formatLineItems is O(n^2) over line items due to repeated string concatenation.",
  evidenceIds: [mockEvidence.id],
  status: "provisional",
};

export const mockHypothesis: Hypothesis = {
  id: "hyp-test-1",
  investigationId: mockRun.id,
  statement:
    "Replacing string concatenation with a single join pass cuts render time by at least 50% on 500-line invoices.",
  status: "testing",
  evidenceIds: [mockEvidence.id],
};

export const mockConclusion: Conclusion = {
  id: "con-test-1",
  investigationId: mockRun.id,
  statement:
    "The slowdown is algorithmic (quadratic formatting), not I/O bound.",
  evidenceIds: [mockEvidence.id],
  limitations: [
    "Only validated on synthetic 500-line invoices, not real customer data.",
  ],
};

export const mockResults: ResultsResponse = {
  findings: [mockFinding],
  evidence: [mockEvidence],
  hypotheses: [mockHypothesis],
  conclusions: [mockConclusion],
};

export const mockExperiment: ExperimentSpec = {
  id: "exp-test-1",
  investigationId: mockRun.id,
  objective: "Compare join-based formatting against the current implementation",
  reference: { artifactId: "artifact-ref-1" },
  alternative: { artifactId: "artifact-alt-1" },
  procedure: ["render 500-line invoice", "record wall time", "repeat 5x"],
  measurements: ["wall_time_ms"],
  repetitions: 5,
  acceptance: "alternative faster on at least 4 of 5 runs",
};

export const mockExperiments: ExperimentsResponse = {
  experiments: [mockExperiment],
};

/** Minimal fetch stub keyed by URL path → JSON payload or HTTP status. */
export function stubFetch(
  routes: Record<string, { status: number; body: unknown }>,
): void {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchMock = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const path = new URL(url, "http://localhost").pathname;
    calls.push({
      url: path,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const route = routes[path];
    if (!route) {
      return new Response(JSON.stringify({ error: "not mocked" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status,
      headers: { "content-type": "application/json" },
    });
  };
  vi.stubGlobal("fetch", fetchMock);
  (globalThis as unknown as { __fetchCalls: unknown }).__fetchCalls = calls;
}

export function fetchCalls(): Array<{
  url: string;
  method: string;
  body?: unknown;
}> {
  return (
    (
      globalThis as unknown as {
        __fetchCalls: Array<{ url: string; method: string; body?: unknown }>;
      }
    ).__fetchCalls ?? []
  );
}
