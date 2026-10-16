/**
 * Tiny typed fetch client for the Reverse Lab API.
 *
 * Plain `fetch` + polling only — no data-fetching dependencies. Client
 * components call `apiGet`/`apiPost` with relative paths; server components
 * never hit the network at build time (every view fetches client-side).
 */

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

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface ErrorPayload {
  error?: unknown;
}

async function parse<T>(res: Response): Promise<T> {
  let data: unknown = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON error bodies (e.g. framework 404 pages) keep the status only.
  }
  if (!res.ok) {
    const payload = data as ErrorPayload;
    const message =
      typeof payload.error === "string"
        ? payload.error
        : `request failed (HTTP ${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** GET a relative API path. `cache: "no-store"` — lab state is always live. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  return parse<T>(res);
}

/** POST JSON to a relative API path. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parse<T>(res);
}

/* -- Response shapes, matching the Phase 1 route handlers verbatim -------- */

export interface ProjectsResponse {
  projects: Project[];
}

export interface ProjectDetailResponse {
  project: Project;
  targets: ResearchTarget[];
  runs: InvestigationRun[];
}

export interface CreateProjectResponse {
  project: Project;
}

export interface CreateTargetResponse {
  target: ResearchTarget;
}

export interface InvestigationResponse {
  run: InvestigationRun;
}

export interface CreateInvestigationResponse {
  run: InvestigationRun;
}

export interface ResultsResponse {
  findings: Finding[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  conclusions: Conclusion[];
}

export interface ExperimentsResponse {
  experiments: ExperimentSpec[];
}

export interface CreateExperimentResponse {
  experiment: ExperimentSpec;
}

/**
 * Ask the engine to work the next plan steps. This endpoint is owned by the
 * investigation engine worker — if it is absent the call throws a 404
 * ApiError and callers must surface an honest "engine offline" state.
 */
export async function triggerAdvance(
  investigationId: string,
  maxSteps?: number,
): Promise<InvestigationRun> {
  const body: { maxSteps?: number } =
    typeof maxSteps === "number" ? { maxSteps } : {};
  const { run } = await apiPost<InvestigationResponse>(
    `/api/investigations/${investigationId}/advance`,
    body,
  );
  return run;
}
