"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowIcon,
  EmptyState,
  LoadingRow,
  SectionHeading,
  StatusBadge,
} from "@/components/ui";
import {
  ApiError,
  apiGet,
  apiPost,
  type CreateInvestigationResponse,
  type CreateTargetResponse,
  type ProjectDetailResponse,
} from "@/lib/api";
import type {
  InvestigationRun,
  ResearchTarget,
  ResearchTargetKind,
} from "@/types";

const TARGET_KINDS: ResearchTargetKind[] = [
  "repo",
  "component",
  "feature",
  "product",
  "docs",
  "article",
  "benchmark",
  "experiment",
];

function AddTargetForm({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: (t: ResearchTarget) => void;
}) {
  const [kind, setKind] = useState<ResearchTargetKind>("repo");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { target } = await apiPost<CreateTargetResponse>(
        `/api/projects/${projectId}/targets`,
        { kind, ref: ref.trim() },
      );
      onAdded(target);
      setRef("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add the target.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      aria-label="Add a research target"
    >
      <h3>Add target</h3>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="target-kind">Kind</label>
        <select
          id="target-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as ResearchTargetKind)}
        >
          {TARGET_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="target-ref">Reference</label>
        <input
          id="target-ref"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="e.g. github.com/acme/billing or ./crates/parser"
          required
        />
        <span className="hint">
          A path, URL, or identifier the investigation can actually inspect.
        </span>
      </div>
      <button type="submit" className="btn" disabled={saving}>
        {saving ? "Adding…" : "Add target"}
      </button>
    </form>
  );
}

function StartInvestigationForm({
  projectId,
  defaultObjective,
}: {
  projectId: string;
  defaultObjective: string;
}) {
  const router = useRouter();
  const [objective, setObjective] = useState(defaultObjective);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStarting(true);
    try {
      const { run } = await apiPost<CreateInvestigationResponse>(
        "/api/investigations",
        { projectId, objective: objective.trim() || undefined },
      );
      router.push(`/investigation/${run.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start the investigation.",
      );
      setStarting(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      aria-label="Start an investigation"
    >
      <h3>Start investigation</h3>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="run-objective">Objective for this run</label>
        <textarea
          id="run-objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Defaults to the project objective."
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={starting}>
        {starting ? "Starting…" : "Start investigation"}
      </button>
      <p
        className="small muted"
        style={{ marginTop: "0.75rem", marginBottom: 0 }}
      >
        The run is recorded immediately; the autonomous engine picks it up when
        it is online.
      </p>
    </form>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<ProjectDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    try {
      const data = await apiGet<ProjectDetailResponse>(`/api/projects/${id}`);
      setDetail(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(
          err instanceof ApiError ? err.message : "Could not load the project.",
        );
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (notFound) {
    return (
      <EmptyState title="Project not found">
        This project id does not exist in the lab store.{" "}
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

  if (!detail) {
    return <LoadingRow label="Loading project…" />;
  }

  const { project, targets, runs } = detail;

  return (
    <>
      <p className="small">
        <Link href="/workspace" className="muted">
          ← workspace
        </Link>
      </p>
      <SectionHeading index="pj">{project.name}</SectionHeading>
      <div className="card" style={{ marginBottom: "2rem" }}>
        <p className="limitations-label">Objective</p>
        <p style={{ marginBottom: "0.5rem" }}>{project.objective}</p>
        {project.constraints.length > 0 ? (
          <>
            <p className="limitations-label">Constraints</p>
            <ul className="limitations">
              {project.constraints.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static verbatim list from the API; never reordered
                <li key={i}>{c}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="mono-id" style={{ marginTop: "1rem", marginBottom: 0 }}>
          {project.id}
        </p>
      </div>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <section className="section" aria-labelledby="targets-h">
            <h2 id="targets-h">Targets ({targets.length})</h2>
            {targets.length === 0 ? (
              <EmptyState title="No targets yet">
                Attach something the investigation can inspect — a repo, a
                component, docs, a benchmark.
              </EmptyState>
            ) : (
              <div className="stack">
                {targets.map((t: ResearchTarget) => (
                  <div className="card" key={t.id}>
                    <span className="badge badge-blue">{t.kind}</span>
                    <p className="mono" style={{ margin: "0.5rem 0 0" }}>
                      {t.ref}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="runs-h">
            <h2 id="runs-h">Investigation runs ({runs.length})</h2>
            {runs.length === 0 ? (
              <EmptyState title="No runs yet">
                Start the first investigation below — runs persist, so you can
                leave and return.
              </EmptyState>
            ) : (
              <div className="stack">
                {runs.map((r: InvestigationRun) => (
                  <Link
                    key={r.id}
                    href={`/investigation/${r.id}`}
                    className="card"
                    style={{ display: "block", color: "inherit" }}
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
                      <StatusBadge status={r.status} />
                      <span className="mono-id">{r.id}</span>
                    </div>
                    <p className="small" style={{ marginBottom: 0 }}>
                      {r.objective}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <AddTargetForm
            projectId={project.id}
            onAdded={(t) =>
              setDetail((d) => (d ? { ...d, targets: [...d.targets, t] } : d))
            }
          />
          <StartInvestigationForm
            projectId={project.id}
            defaultObjective={project.objective}
          />
          <Link
            className="btn"
            href={`/workspace`}
            style={{ display: "inline-flex" }}
          >
            <ArrowIcon /> All projects
          </Link>
        </div>
      </div>
    </>
  );
}
