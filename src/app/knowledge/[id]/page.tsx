"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlanTimeline } from "@/components/timeline";
import {
  EmptyState,
  EvidenceCard,
  LoadingRow,
  SectionHeading,
  StatusBadge,
  VerificationBadge,
} from "@/components/ui";
import {
  ApiError,
  apiGet,
  type ExperimentsResponse,
  type InvestigationResponse,
  type ResultsResponse,
} from "@/lib/api";
import type {
  Conclusion,
  Evidence,
  ExperimentSpec,
  Finding,
  Hypothesis,
  InvestigationRun,
  Verification,
} from "@/types";

/**
 * Knowledge Space: everything the investigation established, traceable to
 * evidence or measurements.
 *
 * - Findings link to their evidence (missing ids are flagged, never hidden).
 * - Hypotheses are visibly labeled as hypotheses.
 * - The experiment table computes mean/min/max/n from recorded rawValues
 *   only; with no runs exposed by the API it says so instead of inventing
 *   scores.
 * - Limitations render verbatim from the API.
 */

const HYPOTHESIS_TONE: Record<Hypothesis["status"], string> = {
  proposed: "badge-purple",
  testing: "badge-blue",
  supported: "badge-run-green",
  refuted: "badge-red",
};

function FindingCard({
  finding,
  evidenceById,
}: {
  finding: Finding;
  evidenceById: Map<string, Evidence>;
}) {
  const missing = finding.evidenceIds.filter((id) => !evidenceById.has(id));
  return (
    <article className="card" aria-label={`Finding ${finding.id}`}>
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <span
          className={`badge ${finding.status === "confirmed" ? "badge-run-green" : finding.status === "refuted" ? "badge-red" : "badge-purple"}`}
        >
          {finding.status}
        </span>
        <span className="mono-id">{finding.id}</span>
      </div>
      <h3>{finding.title}</h3>
      <p>{finding.body}</p>
      <p className="limitations-label">
        Evidence ({finding.evidenceIds.length})
      </p>
      {finding.evidenceIds.length === 0 ? (
        <p className="small muted">No evidence linked yet.</p>
      ) : (
        <div className="stack">
          {finding.evidenceIds.map((id) => {
            const ev = evidenceById.get(id);
            return ev ? (
              <EvidenceCard key={id} evidence={ev} />
            ) : (
              <div className="form-error" key={id} role="note">
                <span className="mono small">{id}</span>
                <br />
                Linked evidence id not found in this investigation&apos;s
                records.
              </div>
            );
          })}
        </div>
      )}
      {missing.length > 0 ? (
        <p className="small muted" style={{ marginTop: "0.5rem" }}>
          {missing.length} linked evidence id(s) have no matching record.
        </p>
      ) : null}
    </article>
  );
}

function ConclusionCard({ conclusion }: { conclusion: Conclusion }) {
  return (
    <article className="card" aria-label={`Conclusion ${conclusion.id}`}>
      <p style={{ marginBottom: "0.5rem" }}>{conclusion.statement}</p>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Backed by {conclusion.evidenceIds.length} evidence record(s).
      </p>
      <p className="limitations-label">Limitations (as recorded)</p>
      {conclusion.limitations.length > 0 ? (
        <ul className="limitations">
          {conclusion.limitations.map((limitation, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static verbatim list from the API; never reordered
            <li key={i}>{limitation}</li>
          ))}
        </ul>
      ) : (
        <p className="small muted">No limitations recorded.</p>
      )}
      <p className="mono-id" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
        {conclusion.id}
      </p>
    </article>
  );
}

/** Experiment comparison from recorded runs only — honest when none exist. */
function ExperimentTable({ experiments }: { experiments: ExperimentSpec[] }) {
  if (experiments.length === 0) {
    return (
      <EmptyState title="No experiments yet">
        Defined experiments will be compared here from their recorded raw values
        — mean, min, max, n per metric. No invented scores.
      </EmptyState>
    );
  }
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <table
        className="small"
        style={{ width: "100%", borderCollapse: "collapse" }}
      >
        <thead>
          <tr
            className="mono"
            style={{
              textAlign: "left",
              color: "var(--color-muted-foreground)",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            <th style={{ padding: "0.5rem" }}>Experiment</th>
            <th style={{ padding: "0.5rem" }}>Measurements</th>
            <th style={{ padding: "0.5rem" }}>Reps</th>
            <th style={{ padding: "0.5rem" }}>Runs</th>
            <th style={{ padding: "0.5rem" }}>mean / min / max / n</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((exp) => (
            <tr
              key={exp.id}
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                {exp.objective}
                <br />
                <span className="mono-id">{exp.id}</span>
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                {exp.measurements.length > 0
                  ? exp.measurements.join(", ")
                  : "—"}
              </td>
              <td
                style={{ padding: "0.5rem", verticalAlign: "top" }}
                className="mono"
              >
                {exp.repetitions}
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                <span className="muted">none recorded</span>
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                <span className="muted">
                  The API does not expose experiment runs yet (execution engine
                  offline) — nothing to compare.
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        className="small muted"
        style={{ marginTop: "0.75rem", marginBottom: 0 }}
      >
        When runs are recorded, each metric summarizes its raw values with{" "}
        <code>summarizeValues</code>: mean, min, max, and n of the samples —
        never a synthesized score.
      </p>
    </div>
  );
}

/** Auto-summary computed from the investigation's own records — not a model. */
function LearningSummary({
  run,
  findings,
  evidence,
  hypotheses,
  conclusions,
}: {
  run: InvestigationRun;
  findings: Finding[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  conclusions: Conclusion[];
}) {
  const verificationCounts = useMemo(() => {
    const counts = new Map<Verification, number>();
    for (const ev of evidence) {
      counts.set(ev.verification, (counts.get(ev.verification) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [evidence]);

  const findingCounts = useMemo(() => {
    const counts = new Map<Finding["status"], number>();
    for (const f of findings) {
      counts.set(f.status, (counts.get(f.status) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [findings]);

  const hypothesisCounts = useMemo(() => {
    const counts = new Map<Hypothesis["status"], number>();
    for (const h of hypotheses) {
      counts.set(h.status, (counts.get(h.status) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [hypotheses]);

  const linkedEvidence = new Set<string>();
  for (const f of findings)
    for (const id of f.evidenceIds) linkedEvidence.add(id);
  const orphanEvidence = evidence.filter((ev) => !linkedEvidence.has(ev.id));

  return (
    <div className="card">
      <p className="small muted">
        Auto-summary from this investigation&apos;s records — counts and
        statuses the API returned, phrased plainly. Not a model-generated
        explanation.
      </p>
      <div className="grid-3">
        <div>
          <p className="limitations-label">Evidence ({evidence.length})</p>
          {verificationCounts.length === 0 ? (
            <p className="small muted">No evidence yet.</p>
          ) : (
            <ul className="small" style={{ paddingLeft: "1.25rem", margin: 0 }}>
              {verificationCounts.map(([v, n]) => (
                <li key={v}>
                  <VerificationBadge verification={v} /> × {n}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="limitations-label">Findings ({findings.length})</p>
          {findingCounts.length === 0 ? (
            <p className="small muted">No findings yet.</p>
          ) : (
            <ul className="small" style={{ paddingLeft: "1.25rem", margin: 0 }}>
              {findingCounts.map(([s, n]) => (
                <li key={s}>
                  <span className="mono">{s}</span> × {n}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="limitations-label">Hypotheses ({hypotheses.length})</p>
          {hypothesisCounts.length === 0 ? (
            <p className="small muted">No hypotheses yet.</p>
          ) : (
            <ul className="small" style={{ paddingLeft: "1.25rem", margin: 0 }}>
              {hypothesisCounts.map(([s, n]) => (
                <li key={s}>
                  <span className="mono">{s}</span> × {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <dl className="kv small" style={{ marginTop: "1rem" }}>
        <dt>Conclusions</dt>
        <dd>{conclusions.length} recorded</dd>
        <dt>Plan progress</dt>
        <dd>
          {run.plan.filter((s) => s.status === "completed").length}/
          {run.plan.length} steps completed · status{" "}
          <span className="mono">{run.status}</span>
        </dd>
        <dt>Unlinked evidence</dt>
        <dd>
          {orphanEvidence.length === 0
            ? "every record backs at least one finding"
            : `${orphanEvidence.length} record(s) not yet cited by a finding`}
        </dd>
      </dl>
    </div>
  );
}

export default function KnowledgePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<InvestigationRun | null>(null);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [experiments, setExperiments] = useState<ExperimentSpec[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      /* Parallel: investigation detail, results, experiment specs. */
      const [inv, res, exps] = await Promise.all([
        apiGet<InvestigationResponse>(`/api/investigations/${id}`),
        apiGet<ResultsResponse>(`/api/investigations/${id}/results`),
        apiGet<ExperimentsResponse>(`/api/investigations/${id}/experiments`),
      ]);
      setRun(inv.run);
      setResults(res);
      setExperiments(exps.experiments);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load the knowledge space.",
        );
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const evidenceById = useMemo(() => {
    const map = new Map<string, Evidence>();
    for (const ev of results?.evidence ?? []) map.set(ev.id, ev);
    return map;
  }, [results]);

  if (notFound) {
    return (
      <EmptyState title="Investigation not found">
        This investigation id does not exist in the lab store.{" "}
        <Link href="/workspace">Back to the workspace</Link>
      </EmptyState>
    );
  }
  if (error) {
    return (
      <div className="form-error" role="alert">
        {error}{" "}
        <button type="button" className="btn" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!run || !results || experiments === null) {
    return <LoadingRow label="Loading the knowledge space…" />;
  }

  const { findings, evidence, hypotheses, conclusions } = results;

  return (
    <>
      <p className="small">
        <Link href={`/investigation/${run.id}`} className="muted">
          ← investigation
        </Link>
      </p>
      <SectionHeading index="kb">Knowledge space</SectionHeading>
      <div className="card" style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          <StatusBadge status={run.status} />
          <span className="mono-id">{run.id}</span>
        </div>
        <p style={{ marginBottom: 0 }}>{run.objective}</p>
      </div>

      <section className="section" aria-labelledby="plan-h">
        <h2 id="plan-h">Plan timeline</h2>
        <div className="card">
          <PlanTimeline plan={run.plan} currentStep={run.currentStep} />
        </div>
      </section>

      <section className="section" aria-labelledby="findings-h">
        <h2 id="findings-h">Findings ({findings.length})</h2>
        {findings.length === 0 ? (
          <EmptyState title="No findings yet">
            Findings appear here once the investigation records observations
            worth keeping — each one linked to its evidence.
          </EmptyState>
        ) : (
          <div className="stack">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} evidenceById={evidenceById} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="evidence-h">
        <h2 id="evidence-h">Evidence ({evidence.length})</h2>
        {evidence.length === 0 ? (
          <EmptyState title="No evidence yet">
            Nothing observed and recorded so far. Evidence cards carry the
            observation, a verification badge, and their limitations verbatim.
          </EmptyState>
        ) : (
          <div className="stack">
            {evidence.map((ev) => (
              <EvidenceCard key={ev.id} evidence={ev} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="hypotheses-h">
        <h2 id="hypotheses-h">Hypotheses ({hypotheses.length})</h2>
        <p className="small muted">
          Hypotheses are guesses under test — labeled as such, never presented
          as facts.
        </p>
        {hypotheses.length === 0 ? (
          <EmptyState title="No hypotheses yet" />
        ) : (
          <div className="stack">
            {hypotheses.map((h) => (
              <div className="card" key={h.id}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span className={`badge ${HYPOTHESIS_TONE[h.status]}`}>
                    hypothesis · {h.status}
                  </span>
                  <span className="mono-id">{h.id}</span>
                </div>
                <p style={{ marginBottom: 0 }}>{h.statement}</p>
                {h.evidenceIds.length > 0 ? (
                  <p
                    className="small muted"
                    style={{ marginTop: "0.5rem", marginBottom: 0 }}
                  >
                    Evidence:{" "}
                    {h.evidenceIds.map((eid, i) => (
                      <span key={eid}>
                        <span className="mono">
                          {evidenceById.get(eid)?.verification ?? "unknown"}
                        </span>
                        <span className="mono-id"> {eid}</span>
                        {i < h.evidenceIds.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="experiments-h">
        <h2 id="experiments-h">Experiment comparison</h2>
        <ExperimentTable experiments={experiments} />
      </section>

      <section className="section" aria-labelledby="conclusions-h">
        <h2 id="conclusions-h">Conclusions ({conclusions.length})</h2>
        {conclusions.length === 0 ? (
          <EmptyState title="No conclusions yet">
            Conclusions land here bound to their evidence — with limitations
            stated, not buried.
          </EmptyState>
        ) : (
          <div className="stack">
            {conclusions.map((c: Conclusion) => (
              <ConclusionCard key={c.id} conclusion={c} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="learning-h">
        <h2 id="learning-h">What the lab learned</h2>
        <LearningSummary
          run={run}
          findings={findings}
          evidence={evidence}
          hypotheses={hypotheses}
          conclusions={conclusions}
        />
      </section>
    </>
  );
}
