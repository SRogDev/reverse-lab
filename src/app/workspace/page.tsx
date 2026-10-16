"use client";

import Link from "next/link";
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
  type CreateProjectResponse,
  type ProjectsResponse,
} from "@/lib/api";
import type { Project } from "@/types";

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/workspace/${project.id}`}
      className="card"
      style={{ display: "block", color: "inherit" }}
    >
      <h3 style={{ marginBottom: "0.25rem" }}>{project.name}</h3>
      <p className="muted small" style={{ marginBottom: "0.75rem" }}>
        {project.objective}
      </p>
      <span
        className="mono small"
        style={{
          display: "inline-flex",
          gap: "0.4rem",
          alignItems: "center",
          color: "var(--color-accent)",
        }}
      >
        Open project <ArrowIcon />
      </span>
    </Link>
  );
}

function CreateProjectForm({ onCreated }: { onCreated: (p: Project) => void }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [constraints, setConstraints] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { project } = await apiPost<CreateProjectResponse>(
        "/api/projects",
        {
          name: name.trim(),
          objective: objective.trim(),
          constraints: constraints
            .split("\n")
            .map((c) => c.trim())
            .filter(Boolean),
        },
      );
      onCreated(project);
      setName("");
      setObjective("");
      setConstraints("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the project.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="card"
      onSubmit={handleSubmit}
      aria-label="Create a research project"
    >
      <h3>New research project</h3>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="project-name">Name</label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Billing-service latency"
          required
          maxLength={120}
        />
      </div>
      <div className="field">
        <label htmlFor="project-objective">Engineering objective</label>
        <textarea
          id="project-objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="What should the investigation figure out or improve?"
          required
        />
        <span className="hint">
          Plain language is fine — the investigation engine works from this.
        </span>
      </div>
      <div className="field">
        <label htmlFor="project-constraints">Constraints (one per line)</label>
        <textarea
          id="project-constraints"
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          placeholder={
            "e.g. no network access during probing\nread-only against production data"
          }
          style={{ minHeight: "72px" }}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

export default function WorkspacePage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { projects } = await apiGet<ProjectsResponse>("/api/projects");
      setProjects(projects);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load projects.",
      );
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <SectionHeading index="ws">Research workspace</SectionHeading>
      <p className="muted" style={{ maxWidth: "46rem" }}>
        Projects hold an engineering objective and the targets under study.
        Create one, attach targets, then start an autonomous investigation.
      </p>

      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="stack">
          <h2>Projects</h2>
          {error ? (
            <div className="form-error" role="alert">
              {error}{" "}
              <button type="button" className="btn" onClick={() => void load()}>
                Retry
              </button>
            </div>
          ) : null}
          {projects === null ? (
            <LoadingRow label="Loading projects…" />
          ) : projects.length === 0 ? (
            <EmptyState title="No projects yet">
              Create the first one — a good objective fits in one or two
              sentences.
            </EmptyState>
          ) : (
            <div className="stack">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>
        <div>
          <CreateProjectForm
            onCreated={(p) => setProjects((prev) => [p, ...(prev ?? [])])}
          />
          <div className="card" style={{ marginTop: "1rem" }}>
            <h3
              className="small mono"
              style={{ color: "var(--color-muted-foreground)" }}
            >
              What happens next
            </h3>
            <p className="small muted" style={{ marginBottom: 0 }}>
              Open the project to attach targets (repo, component, feature,
              docs, benchmark…) and start an investigation. Runs persist — you
              can leave and return later.
            </p>
          </div>
        </div>
      </div>

      <p className="small muted" style={{ marginTop: "2rem" }}>
        <StatusBadge status="provisional" /> API-backed: everything here is
        stored in the lab&apos;s FileStore, zero keys required.
      </p>
    </>
  );
}
