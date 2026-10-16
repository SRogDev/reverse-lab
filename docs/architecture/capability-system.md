# Capability System — Reverse Lab

**Status: future direction only.** The MVP uses a minimal internal capability abstraction where it helps the orchestrator invoke tools consistently. This document describes where that abstraction is allowed to grow — it is not a build spec for the MVP.

## Why capabilities

The investigation engine must use heterogeneous tools (RE analyzers, research fetchers, code generators, test runners, measurement collectors) through one consistent interface so the orchestrator can select, invoke, and record them uniformly.

## Capability contract (internal)

A capability describes, as appropriate:

- **Identifier** — stable name (e.g. `source-dependency-graph`).
- **Purpose** — what engineering question it answers.
- **Supported target types** — source repo, binary, docs, API, etc.
- **Input requirements** — what it needs (target ref, config, constraints).
- **Output schema** — structured result shape.
- **Evidence produced** — what evidence records it yields and their verification status.
- **Dependencies** — tools, services, credentials required.
- **Execution requirements** — environment, time/resource bounds, network needs.
- **Known limitations** — what it cannot do or cannot be trusted for.
- **Permissions** — what it may touch (read-only target? network? filesystem?).

REA capabilities are integrated through the most reliable verified interface (MCP or CLI — see `docs/research/rea-integration.md`), wrapped to this contract. Wrapping is an adapter, not a reimplementation.

## Growth direction (post-MVP)

Future capabilities may add:

- New reverse-engineering techniques (language-specific analyzers, deeper binary analysis).
- Behavioral observation tools (network tracing, dynamic instrumentation).
- Benchmark adapters (established benchmarks with verified provenance).
- Domain-specific research workflows.

Each new capability declares the same contract: inputs, outputs, dependencies, permissions, execution requirements, evidence, and limitations. Capabilities that cannot declare these are not admitted.

## Explicitly out of scope

- A public plugin SDK.
- A marketplace or third-party installation system.
- Any extension mechanism that bypasses the permission and evidence contracts.

These stay out until a validated need exists. The internal design only needs to *allow* future extensions without *building* the extension platform now.
