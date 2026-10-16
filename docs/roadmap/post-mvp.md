# Post-MVP Roadmap — Reverse Lab

Ordered by dependency. Nothing here is committed; each item needs its own validation before it becomes work.

## 1. Harden the validated core

- Longer-running investigations (durable execution beyond current limits).
- More concurrent investigations per user.
- Broader target support driven by real usage (more languages, larger repos).
- Reliability: retry policies, partial-result recovery, cost guardrails per investigation.

## 2. Deeper reverse engineering

- Native binary analysis, if Phase 0/1 shows the infra cost is justified (Ghidra as integration, not a new engine).
- Language-specific analyzers behind the capability contract.
- Dynamic/behavioral observation tools (tracing, instrumentation) where authorized.
- Richer architecture reconstruction (call graphs, data-flow views) — only visualizations that real investigations needed.

## 3. Stronger experimentation

- More benchmark adapters (established benchmarks, verified provenance only).
- Better measurement statistics (confidence intervals, variance analysis) — still no invented composite scores.
- Experiment templates for recurring objective types.

## 4. Learning engine v2

- Guided walkthroughs generated from a user's own investigations.
- Comparisons across a user's investigations ("how others solved X" from their own history).
- Curricula remain out until the core learning explanations prove valuable.

## 5. Extension system (internal first)

- Internal capability development following `docs/architecture/capability-system.md`.
- Public SDK / marketplace only if internal extensions validate the contract design.

## 6. Commercialization (Phase 8)

See `docs/commercial/`. Research Credits accounting, Polar integration, Pro/Scale/Enterprise plans, usage limits, billing events, Resend notifications. Built on measured costs, not estimates.

## 7. Team and enterprise

- Shared projects, roles, audit logs.
- SSO, data-retention controls, private deployment options.
- Only after single-user MVP validation and commercial basics.

## What never becomes the product

- A generic AI chat over repos.
- A "code quality score" vendor.
- A GPU-training platform.
