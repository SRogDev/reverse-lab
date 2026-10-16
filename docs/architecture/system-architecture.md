# System Architecture — Reverse Lab

Phase 0 proposal. The execution-environment selection is delegated to `execution-environments.md` (the Phase 0 feasibility finding); this document describes the structure around it.

## Shape: modular monolith

One Next.js + TypeScript application. No microservices in the MVP. Module boundaries are conceptual and enforced by directory structure and imports — a module is created only when a validated workflow needs it, never as an empty abstraction.

### Conceptual modules

| Module | Responsibility |
|---|---|
| `research-projects` | Projects, objectives, targets, constraints |
| `investigation-engine` | Planning, orchestration, plan revision, run lifecycle |
| `reverse-engineering` | RE operations over targets |
| `capabilities` | Capability registry + invocation (see `capability-system.md`) |
| `research` | Documentation/article/benchmark investigation |
| `evidence` | Structured evidence records, verification status |
| `experiments` | Experiment specs, runs, comparisons |
| `measurements` | Measurement collection and integrity metadata |
| `artifacts` | Generated implementations and durable outputs |
| `learning` | Explanations grounded in investigation results |
| `integrations/mcp` | MCP client (REA, other servers) and MCP server (external agents) |
| `billing` | Future — Phase 8 only |
| `notifications` | Future — Phase 8 only |

## Data flow

```
User (Workspace / Investigation View / Knowledge Space)
  → Next.js API routes (application services)
    → Investigation engine (Vercel AI SDK orchestrator)
        → Capabilities (RE tools, research, codegen)
            → Isolated execution (see execution-environments.md)
        → Evidence store (Supabase)
        → Experiment records (Supabase)
  → Knowledge Space reads (Supabase, evidence-linked)
External agents → MCP server → same application services
```

## Key architectural decisions

1. **Orchestration and execution are separated.** The Next.js app plans and coordinates; untrusted code (analyzed repos, generated alternatives, tests) runs only in the isolated execution environment. The app never `eval`s target code in-process.
2. **Investigations are persistent jobs, not requests.** Run state (pending / running / completed / failed / blocked / needs-evaluation / provisional) lives in Supabase. Progress is pollable; recovery and retry are first-class.
3. **Evidence is relational, not a blob.** Findings, evidence, hypotheses, experiments, and conclusions are structured rows with explicit relationships, because the product needs to query them, authorize them per user, and trace conclusions to evidence.
4. **The MCP server is a thin adapter.** It exposes the same application services the UI uses — no parallel logic. One long-lived MCP request is never required for a whole investigation.
5. **Per-user isolation via Supabase RLS.** Projects, evidence, experiments, and artifacts are scoped to their owner; Row Level Security enforces it at the database level.

## Invariants (non-negotiable)

- Every important conclusion references its supporting evidence.
- Observed behavior and inferred internals are stored and displayed separately.
- Failed tool invocations, experiments, and runs remain visible as failures.
- Repositories, generated code, and binaries are treated as untrusted inputs; experimental code never sees application credentials or other users' data.
- No measurement is reported without its execution context (environment, inputs, repetitions, raw data, known variability).
- Nothing is presented as a universal quality score without a justified methodology.

## Open questions for Phase 1

- Execution environment final pick → resolved in `execution-environments.md`.
- RE capability set → resolved in `docs/research/rea-capability-matrix.md` and `rea-integration.md`.
- Exact Supabase schema → derived from the MVP workflow in Phase 2 (`supabase/migrations/`).
