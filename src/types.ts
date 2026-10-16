/**
 * Shared domain contract for Reverse Lab.
 *
 * This file is the single source of truth for the Phase 1 domain shapes.
 * Later workers depend on these interfaces verbatim: do not rename fields
 * or narrow unions without a coordinated migration.
 *
 * ID conventions:
 * - Entity ids: `crypto.randomUUID()` (see `generateId`).
 * - REA evidence: the `ev_<sha256>` id produced by REA itself (content-addressed).
 * - Lab-generated evidence: `lab-ev-<sha256 of canonical content>` (see `labEvidenceId`).
 */

import { createHash } from "node:crypto";

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "needs-evaluation"
  | "provisional";

export type Verification =
  | "observed"
  | "source-fact"
  | "third-party"
  | "measured"
  | "hypothesis"
  | "inferred";

export interface Evidence {
  id: string;
  type: string;
  source: string;
  sourceUrl?: string;
  observation: string;
  limitations: string[];
  verification: Verification;
  provenance: Record<string, unknown>;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  objective: string;
  constraints: string[];
  createdAt: string;
  updatedAt: string;
}

export type ResearchTargetKind =
  | "repo"
  | "component"
  | "feature"
  | "product"
  | "docs"
  | "article"
  | "benchmark"
  | "experiment";

export interface ResearchTarget {
  id: string;
  projectId: string;
  kind: ResearchTargetKind;
  ref: string;
  createdAt: string;
}

export interface PlanStep {
  id: string;
  title: string;
  status: RunStatus;
  detail?: string;
}

export interface InvestigationRun {
  id: string;
  projectId: string;
  objective: string;
  status: RunStatus;
  plan: PlanStep[];
  currentStep?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export type FindingStatus = "provisional" | "confirmed" | "refuted";

export interface Finding {
  id: string;
  investigationId: string;
  title: string;
  body: string;
  evidenceIds: string[];
  status: FindingStatus;
}

export type HypothesisStatus = "proposed" | "testing" | "supported" | "refuted";

export interface Hypothesis {
  id: string;
  investigationId: string;
  statement: string;
  status: HypothesisStatus;
  evidenceIds: string[];
}

export interface ExperimentSpec {
  id: string;
  investigationId: string;
  objective: string;
  hypothesisId?: string;
  reference: { artifactId: string };
  alternative?: { artifactId: string };
  procedure: string[];
  measurements: string[];
  repetitions: number;
  acceptance: string;
}

export interface ExperimentRun {
  id: string;
  experimentId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  environment: Record<string, unknown>;
  rawValues: Record<string, number[]>;
  failures: string[];
  notes?: string;
}

export type ArtifactKind = "implementation" | "report" | "test-result";

export interface Artifact {
  id: string;
  investigationId: string;
  kind: ArtifactKind;
  path: string;
  description: string;
  createdAt: string;
}

export interface Conclusion {
  id: string;
  investigationId: string;
  statement: string;
  evidenceIds: string[];
  limitations: string[];
}

/** New entity ids. */
export function generateId(): string {
  return crypto.randomUUID();
}

/** ISO-8601 UTC timestamp for `createdAt` / `updatedAt` / `startedAt`. */
export function nowIso(): string {
  return new Date().toISOString();
}

export const REA_EVIDENCE_ID_PATTERN = /^ev_[0-9a-f]{64}$/;
export const LAB_EVIDENCE_ID_PATTERN = /^lab-ev-[0-9a-f]{64}$/;

/** Cheap integrity check for REA-issued evidence ids. */
export function isReaEvidenceId(id: string): boolean {
  return REA_EVIDENCE_ID_PATTERN.test(id);
}

/** Cheap integrity check for lab-issued evidence ids. */
export function isLabEvidenceId(id: string): boolean {
  return LAB_EVIDENCE_ID_PATTERN.test(id);
}

/**
 * Content-addressed id for lab-generated evidence.
 * `canonicalContent` must already be canonical (e.g. stable JSON); identical
 * content yields identical ids, so re-ingestion deduplicates for free.
 */
export function labEvidenceId(canonicalContent: string): string {
  const digest = createHash("sha256")
    .update(canonicalContent, "utf8")
    .digest("hex");
  return `lab-ev-${digest}`;
}
