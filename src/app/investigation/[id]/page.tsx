"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlanTimeline } from "@/components/timeline";
import {
  EmptyState,
  LoadingRow,
  SectionHeading,
  StatusBadge,
} from "@/components/ui";
import { ApiError, apiGet, type InvestigationResponse } from "@/lib/api";
import type { InvestigationRun } from "@/types";
import { AdvancePanel } from "./AdvancePanel";
import { ExperimentsPanel } from "./ExperimentsPanel";

const POLL_INTERVAL_MS = 3000;

/* -- Page ------------------------------------------------------------------- */

export default function InvestigationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<InvestigationRun | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const runRef = useRef<InvestigationRun | null>(null);
  runRef.current = run;

  const fetchRun = useCallback(async () => {
    const { run } = await apiGet<InvestigationResponse>(
      `/api/investigations/${id}`,
    );
    return run;
  }, [id]);

  /* Initial load */
  useEffect(() => {
    let cancelled = false;
    fetchRun()
      .then((r) => {
        if (!cancelled) setRun(r);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else
          setLoadError(
            err instanceof ApiError
              ? err.message
              : "Could not load the investigation.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [fetchRun]);

  /* Live polling: 3s interval, cleaned up on unmount or id change. Stops
     reporting once the run reaches a terminal state. */
  useEffect(() => {
    const timer = setInterval(() => {
      const current = runRef.current;
      if (
        current &&
        (current.status === "completed" || current.status === "failed")
      ) {
        clearInterval(timer);
        return;
      }
      fetchRun()
        .then((r) => {
          runRef.current = r;
          setRun(r);
        })
        .catch(() => {
          /* Polling failures are silent; the last good state stays visible. */
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchRun]);

  if (notFound) {
    return (
      <EmptyState title="Investigation not found">
        This investigation id does not exist in the lab store.{" "}
        <Link href="/workspace">Back to the workspace</Link>
      </EmptyState>
    );
  }

  if (loadError) {
    return (
      <div className="form-error" role="alert">
        {loadError}
      </div>
    );
  }

  if (!run) {
    return <LoadingRow label="Loading investigation…" />;
  }

  const doneCount = run.plan.filter((s) => s.status === "completed").length;

  return (
    <>
      <p className="small">
        <Link href={`/workspace/${run.projectId}`} className="muted">
          ← project
        </Link>
      </p>
      <SectionHeading index="inv">Investigation</SectionHeading>

      <div className="card" style={{ marginBottom: "2rem" }}>
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "0.75rem",
          }}
        >
          <StatusBadge status={run.status} />
          <span className="badge">{`plan ${doneCount}/${run.plan.length} done`}</span>
          <span className="mono-id" style={{ marginLeft: "auto" }}>
            {run.id}
          </span>
        </div>
        <p className="limitations-label">Objective</p>
        <p style={{ marginBottom: "0.5rem" }}>{run.objective}</p>
        <dl className="kv small">
          <dt>Updated</dt>
          <dd className="mono">{run.updatedAt}</dd>
          <dt>Created</dt>
          <dd className="mono">{run.createdAt}</dd>
        </dl>
        <p style={{ marginTop: "1rem", marginBottom: 0 }}>
          <Link className="btn" href={`/knowledge/${run.id}`}>
            Open the knowledge space
          </Link>
        </p>
      </div>

      <section className="section" aria-labelledby="engine-h">
        <h2 id="engine-h">Engine control</h2>
        <AdvancePanel investigationId={run.id} onRunUpdated={setRun} />
      </section>

      <section className="section" aria-labelledby="plan-h">
        <h2 id="plan-h">Plan — live</h2>
        <div className="card">
          <PlanTimeline plan={run.plan} currentStep={run.currentStep} />
          <p
            className="small muted"
            style={{ marginTop: "1rem", marginBottom: 0 }}
          >
            Refreshed every 3 s while this view is open.
          </p>
        </div>
      </section>

      <section className="section" aria-labelledby="tech-h">
        <h2 id="tech-h">Techniques &amp; tools in use</h2>
        <EmptyState title="No technique records yet">
          The API does not expose a tool/technique ledger for investigations.
          When the engine runs, the capabilities it invokes will appear here.
        </EmptyState>
      </section>

      <ExperimentsPanel investigationId={run.id} />

      <section className="section" aria-labelledby="errors-h">
        <h2 id="errors-h">Errors &amp; limitations</h2>
        {run.error ? (
          <div className="form-error" role="alert">
            <span className="mono small">engine error</span>
            <br />
            {run.error}
          </div>
        ) : (
          <EmptyState title="No errors recorded">
            Failed steps and engine errors will appear here verbatim — never
            converted into apparent successes.
          </EmptyState>
        )}
      </section>

      <section className="section" aria-labelledby="artifacts-h">
        <h2 id="artifacts-h">Artifacts</h2>
        <EmptyState title="No artifacts API yet">
          Generated implementations and reports will be listed here once the
          engine produces them and the API exposes them.
        </EmptyState>
      </section>

      <p className="small muted">
        Questions the investigation is pursuing, findings, and hypotheses live
        in the <Link href={`/knowledge/${run.id}`}>knowledge space</Link>,
        linked to their evidence.
      </p>
    </>
  );
}
