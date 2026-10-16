/**
 * Shared presentational atoms for the Reverse Lab UI.
 *
 * Server-safe (no "use client") — pages that need interactivity wrap these
 * in their own client components. Icons are inline SVG, never emoji.
 */

import type { ReactNode } from "react";
import type { Evidence, RunStatus, Verification } from "@/types";

/* -- Status -------------------------------------------------------------- */

const RUN_STATUS_TONE: Record<RunStatus, string> = {
  pending: "",
  running: "badge-run-green badge-pulse",
  completed: "badge-run-green",
  failed: "badge-red",
  blocked: "badge-amber",
  "needs-evaluation": "badge-blue",
  provisional: "badge-purple",
};

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`badge ${RUN_STATUS_TONE[status]}`}>
      <span className="dot" aria-hidden="true" />
      {status}
    </span>
  );
}

/* -- Verification ---------------------------------------------------------- */

const VERIFICATION_TONE: Record<Verification, string> = {
  observed: "badge-run-green",
  "source-fact": "badge-blue",
  "third-party": "badge-amber",
  measured: "badge-run-green",
  hypothesis: "badge-purple",
  inferred: "badge-orange",
};

export function VerificationBadge({
  verification,
}: {
  verification: Verification;
}) {
  return (
    <span className={`badge ${VERIFICATION_TONE[verification]}`}>
      {verification}
    </span>
  );
}

/* -- Evidence -------------------------------------------------------------- */

export function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <article
      className="card evidence-card"
      data-verification={evidence.verification}
      aria-label={`Evidence ${evidence.id}`}
    >
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <VerificationBadge verification={evidence.verification} />
        <span className="mono-id">{evidence.id}</span>
      </div>
      <p>{evidence.observation}</p>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Source: <span className="mono">{evidence.source}</span>
        {evidence.type ? ` · type: ${evidence.type}` : null}
      </p>
      <p className="limitations-label">Limitations (as recorded)</p>
      {evidence.limitations.length > 0 ? (
        <ul className="limitations">
          {evidence.limitations.map((limitation, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static verbatim list from the API; never reordered
            <li key={i}>{limitation}</li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No limitations recorded.</p>
      )}
    </article>
  );
}

/* -- Feedback states ------------------------------------------------------- */

export function LoadingRow({ label }: { label: string }) {
  return (
    <div className="loading-row" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="mono">{title}</span>
      {children}
    </div>
  );
}

export function SectionHeading({
  index,
  children,
}: {
  index: string;
  children: ReactNode;
}) {
  return (
    <h2>
      <span className="section-index" aria-hidden="true">
        {index}
      </span>
      {children}
    </h2>
  );
}

/* -- Inline SVG icons ------------------------------------------------------ */

export function ArrowIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 8h11M9 3.5 13.5 8 9 12.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlaskIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 2h4M7 2v4.2L3.1 12a1.6 1.6 0 0 0 1.4 2.4h7a1.6 1.6 0 0 0 1.4-2.4L9 6.2V2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 10h5.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
