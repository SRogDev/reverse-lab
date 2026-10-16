"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  FlaskIcon,
  LoadingRow,
  SectionHeading,
  StatusBadge,
} from "@/components/ui";
import {
  ApiError,
  apiGet,
  apiPost,
  type CreateExperimentResponse,
  type ExperimentsResponse,
} from "@/lib/api";
import type { ExperimentSpec } from "@/types";

/**
 * Experiment specs for one investigation, plus execution triggers.
 *
 * Defining a spec is real store work (201). Executing it needs the
 * investigation engine — POST /experiments/[id]/run answers 501 until then,
 * and the message is shown verbatim. Nothing here pretends a run happened.
 */

function DefineExperimentForm({
  investigationId,
  onCreated,
}: {
  investigationId: string;
  onCreated: (e: ExperimentSpec) => void;
}) {
  const [objective, setObjective] = useState("");
  const [artifactId, setArtifactId] = useState("");
  const [procedure, setProcedure] = useState("");
  const [measurements, setMeasurements] = useState("");
  const [repetitions, setRepetitions] = useState("5");
  const [acceptance, setAcceptance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function lines(value: string): string[] {
    return value
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { experiment } = await apiPost<CreateExperimentResponse>(
        "/api/experiments",
        {
          investigationId,
          spec: {
            objective: objective.trim(),
            reference: { artifactId: artifactId.trim() },
            procedure: lines(procedure),
            measurements: lines(measurements),
            repetitions: Number.parseInt(repetitions, 10) || 1,
            acceptance: acceptance.trim(),
          },
        },
      );
      onCreated(experiment);
      setObjective("");
      setArtifactId("");
      setProcedure("");
      setMeasurements("");
      setAcceptance("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not define the experiment.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      aria-label="Define an experiment"
    >
      <h3>Define experiment</h3>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="exp-objective">Objective</label>
        <input
          id="exp-objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. compare alternative parser against reference on 2 MB inputs"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="exp-artifact">Reference artifact id</label>
        <input
          id="exp-artifact"
          className="mono"
          value={artifactId}
          onChange={(e) => setArtifactId(e.target.value)}
          placeholder="artifact id of the reference implementation"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="exp-procedure">Procedure (one step per line)</label>
        <textarea
          id="exp-procedure"
          value={procedure}
          onChange={(e) => setProcedure(e.target.value)}
          placeholder={
            "load input corpus\nrun reference 5×, record wall time\nrun alternative 5×, record wall time"
          }
        />
      </div>
      <div className="field">
        <label htmlFor="exp-measurements">Measurements (one per line)</label>
        <textarea
          id="exp-measurements"
          value={measurements}
          onChange={(e) => setMeasurements(e.target.value)}
          placeholder={"wall_time_ms\npeak_rss_mb"}
          style={{ minHeight: "72px" }}
        />
      </div>
      <div className="field">
        <label htmlFor="exp-repetitions">Repetitions</label>
        <input
          id="exp-repetitions"
          type="number"
          min={1}
          value={repetitions}
          onChange={(e) => setRepetitions(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="exp-acceptance">Acceptance</label>
        <textarea
          id="exp-acceptance"
          value={acceptance}
          onChange={(e) => setAcceptance(e.target.value)}
          placeholder="e.g. alternative is faster on ≥4/5 inputs with p < 0.05"
          style={{ minHeight: "72px" }}
        />
      </div>
      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Saving…" : "Save experiment spec"}
      </button>
    </form>
  );
}

export function ExperimentsPanel({
  investigationId,
}: {
  investigationId: string;
}) {
  const [experiments, setExperiments] = useState<ExperimentSpec[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runNotices, setRunNotices] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const { experiments } = await apiGet<ExperimentsResponse>(
        `/api/investigations/${investigationId}/experiments`,
      );
      setExperiments(experiments);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load experiments.",
      );
      setExperiments([]);
    }
  }, [investigationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRun(experimentId: string) {
    setRunningId(experimentId);
    try {
      await apiPost(`/api/experiments/${experimentId}/run`, {});
      /* Unreachable while the engine is offline — kept for when it lands. */
      setRunNotices((n) => ({ ...n, [experimentId]: "Run accepted." }));
    } catch (err) {
      const text =
        err instanceof ApiError
          ? `Not executed (HTTP ${err.status}): ${err.message}`
          : "Not executed: the request could not be completed.";
      setRunNotices((n) => ({ ...n, [experimentId]: text }));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <section className="section" aria-labelledby="experiments-h">
      <SectionHeading index="exp">Experiments</SectionHeading>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          {error ? (
            <div className="form-error" role="alert">
              {error}{" "}
              <button type="button" className="btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : null}
          {experiments === null ? (
            <LoadingRow label="Loading experiments…" />
          ) : experiments.length === 0 ? (
            <EmptyState title="No experiments defined">
              Define one on the right — a spec the engine can execute in
              isolation once it is online.
            </EmptyState>
          ) : (
            experiments.map((exp) => (
              <div className="card" key={exp.id}>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: "0.5rem",
                  }}
                >
                  <FlaskIcon />
                  <strong className="small">{exp.objective}</strong>
                </div>
                <dl className="kv small">
                  <dt>Repetitions</dt>
                  <dd className="mono">{exp.repetitions}</dd>
                  <dt>Reference</dt>
                  <dd className="mono mono-id">{exp.reference.artifactId}</dd>
                  {exp.alternative ? (
                    <>
                      <dt>Alternative</dt>
                      <dd className="mono mono-id">
                        {exp.alternative.artifactId}
                      </dd>
                    </>
                  ) : null}
                </dl>
                {exp.procedure.length > 0 ? (
                  <>
                    <p className="limitations-label">Procedure</p>
                    <ol
                      className="small"
                      style={{ margin: "0.25rem 0", paddingLeft: "1.25rem" }}
                    >
                      {exp.procedure.map((step, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: static list from the API; never reordered
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
                <p className="small muted" style={{ margin: "0.5rem 0" }}>
                  Measures:{" "}
                  {exp.measurements.length > 0
                    ? exp.measurements.join(", ")
                    : "—"}
                </p>
                <p className="small" style={{ marginBottom: "0.75rem" }}>
                  <span className="muted">Acceptance:</span>{" "}
                  {exp.acceptance || "—"}
                </p>
                <button
                  type="button"
                  className="btn"
                  disabled={runningId === exp.id}
                  onClick={() => void handleRun(exp.id)}
                >
                  {runningId === exp.id ? "Requesting…" : "Run experiment"}
                </button>
                {runNotices[exp.id] ? (
                  <p
                    className="small muted"
                    role="status"
                    style={{ marginTop: "0.5rem", marginBottom: 0 }}
                  >
                    {runNotices[exp.id]}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
        <DefineExperimentForm
          investigationId={investigationId}
          onCreated={(e) => setExperiments((prev) => [...(prev ?? []), e])}
        />
      </div>
      <p className="small muted" style={{ marginTop: "1rem" }}>
        <StatusBadge status="blocked" /> Execution needs the investigation
        engine. The run request above currently answers 501 and records nothing.
      </p>
    </section>
  );
}
