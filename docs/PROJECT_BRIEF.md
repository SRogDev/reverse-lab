# PROJECT BRIEF — Reverse Lab

Full handoff context for any AI agent picking up this project. Distilled from the founder's product plan (2026-10-16); the plan itself is not stored here — this document is the source of truth.

## 1. What this is

Reverse Lab is an **autonomous reverse engineering & experimental engineering laboratory** for developers and technical professionals.

It is not a Deep Research wrapper, not an AI coding agent over a repo, and not a documentation summarizer. It:

1. **Investigates** how software systems work (reverse engineering — the core discipline),
2. **Reconstructs** architecture and behavior from evidence,
3. **Identifies** improvement opportunities,
4. **Builds** alternative implementations,
5. **Validates** them through real experiments with measured results.

**Core principle:** the user defines the engineering objective. Reverse Lab autonomously determines how to investigate it — which tools to use, which questions to answer, which experiments to run — and iterates toward a better solution. The user can inspect results, change constraints, request alternatives, and redirect at any time. Investigation state persists across runs so iterations build on prior knowledge instead of restarting.

## 2. Target audience

Software developers, AI engineers, software architects, technical founders, open-source maintainers, engineers exploring unfamiliar technologies. The initial target: a developer investigating a specific engineering problem who wants to understand existing implementations and build something better.

## 3. Product experience — three views

### 3.1 Research Workspace
The user creates a **Research Project** (an investigation, not just a repo) and describes an engineering objective in natural language. A project holds multiple research targets: git repos, components, features, products, docs, articles, benchmarks, experimental implementations. The user inspects and edits the objective, constraints, targets, and key decisions. Example objectives: "investigate how modern agent frameworks implement tool execution and develop a simpler, more efficient alternative", "compare open-source semantic-search implementations and pick the best architecture for my app", "reverse engineer feature X and reconstruct its essential behavior in TypeScript".

### 3.2 Investigation View
Shows the live investigation: original objective, current stage, targets, tools in use, questions under investigation, discoveries and open questions, hypotheses, experiments (planned/running), generated implementations, evaluation results, errors and execution limits. Must communicate **meaningful progress**, not a generic spinner. Investigations persist independently of HTTP requests; users can leave and return without losing state.

### 3.3 Knowledge Space
The accumulated, navigable results: architecture explanations, dependency/call graphs, reconstructed flows, code references, behavioral observations, findings, hypotheses, experiment specs, alternative implementations, measurements, comparisons, conclusions and limitations. Presentation adapts to what's actually available. **Every important conclusion must be traceable to evidence or experimental results.**

### 3.4 Landing page
Simple, focused, futuristic-minimal-technical. Explains what Reverse Lab does, which problems it addresses, how autonomous RE + experimentation works, why it goes beyond ordinary AI research/coding tools, and what kinds of objectives users can investigate. No generic SaaS marketing, no unsupported performance claims.

## 4. Technical direction

### 4.1 Preferred stack (to be validated in Phase 0)
Next.js + React + TypeScript · Vercel AI SDK + Vercel AI Gateway · Supabase PostgreSQL (+ RLS) · Vercel Sandbox for compatible isolated execution · REA for initial reverse-engineering capabilities (under audit) · MCP for external tool integration. Modular monolith. No extra databases, orchestration frameworks, or infrastructure without a validated requirement.

### 4.2 Reverse engineering engine
Do **not** build a general RE engine from scratch before auditing existing tools. Audit REA's actual code first (structure, architecture, tools, MCP/CLI interfaces, target types, workflows, I/O contracts, evidence mechanisms, deps, install requirements, constraints, limitations) and classify capabilities as **verified / needs-configuration / unverified**. Then cover six pipeline categories using existing capabilities where possible:
- **A. Source RE** — architecture, modules, dependencies, flows, relationships, data structures, algorithms, integrations (use real analysis tools, not just LLM-reading-code).
- **B. Black-box behavioral RE** — controlled interaction, I/O observation, authorized network inspection, hypothesis-driven experiments. Observed behavior ≠ inferred internals, always.
- **C. Native binary RE** — evaluate REA + Ghidra support; Ghidra is an integration dependency, not a new engine to build. Not a mandatory MVP dependency if infra cost is excessive.
- **D. Architecture reconstruction** — observed vs inferred relationships kept separate, traceable to evidence.
- **E. Implementation reconstruction** — understand reference → spec → alternative → test → compare → document diffs. Respect licenses; access ≠ right to reproduce.
- **F. Experimental optimization** — find opportunity → alternative → test the property (time, memory, throughput, simplicity, deps, reliability). No universal "engineering quality" scores.
- Build custom capabilities **only** for verified gaps, after checking adapters/compositions first. Each custom capability defines inputs, outputs, evidence, deps, limitations.

### 4.3 Autonomous investigation engine
Vercel AI SDK + TypeScript. No LangGraph unless a demonstrated requirement justifies it. Adaptive execution through conceptual stages (understand objective → constraints → discover targets → select techniques → inspect → reconstruct → hypothesize → identify improvements → design experiments → generate alternatives → execute → compare → explain → iterate-or-finish). The orchestrator picks the steps each investigation needs — a source-code inspection must not trigger binary analysis or benchmarking. Produces and revises an investigation plan (objective, questions, targets, capabilities, operations, hypotheses, expected evidence, evaluation criteria, constraints, limitations). **State persists** (pending/running/completed/failed/blocked/needs-evaluation/provisional) with recovery and retry — never one giant HTTP request. Users can continue an investigation with new instructions; prior findings are reused, prior hypotheses are not treated as facts.

### 4.4 Evidence model
Structured records, not prose-only: type, source id/URL, code location, observation, target, investigation, timestamp/version, verification status, limitations. Distinguish direct observations, source-code facts, third-party claims, experimental measurements, agent hypotheses, inferred conclusions. Conclusions reference their evidence; uncertainty is communicated, not hidden.

### 4.5 Experimentation
Explicit experiment specs (objective, reference, alternative, expected behavior, constraints, inputs, measurement targets, environment, procedure, repetitions, acceptance conditions, limitations). Evaluation via existing tests, conformance tests, established benchmarks (verify provenance), direct measurements (time, latency, throughput, memory, errors, size — as relevant, never mandatory-all), or custom focused experiments (documented, never presented as universal benchmarks). **Measurement integrity:** every result carries implementation/runtime/environment/input/config/procedure/repetitions/raw data/failures/variability sources. Equivalent conditions for comparisons. Published results vs Reverse-Lab measurements vs inferred conclusions are labeled separately. **Never fabricate or simulate results. No arbitrary composite scores.** MVP must not depend on GPU training/benchmarking; if hardware is unavailable, say so and propose an alternative.

### 4.6 Code generation
A means, not the product. Before generating an alternative: behavior to preserve, objective to improve, constraints, tests, evaluation procedure. Artifacts are identifiable and linked (investigation, reference, hypothesis, experiment, results, limitations). Multiple alternatives coexist. Never overwrite a reference without explicit authorization.

### 4.7 Execution environment
Separate orchestration from experimental execution. Next.js: UI, API, projects, orchestration, auth, presentation, MCP. Supabase: projects, investigation state, evidence, experiments, results, artifact references. Vercel Sandbox: compatible isolated execution (run code/tests/benchmarks, compare implementations, produce artifacts). RE providers run RE operations in their supported environments — do **not** assume everything runs inside the Sandbox; document limits and propose the smallest viable alternative. Investigations are persistent jobs (start, track, retrieve, recover, retry, continue). Validate real duration/resource limits; never claim indefinite execution. Security: treat repos/generated code/binaries as untrusted; isolate execution; time/resource limits; no credentials to experimental code; restricted network; inputs as data not instructions; per-user boundaries; audit executed operations; human approval for consequential actions.

### 4.8 MCP
Both directions. As a client: use REA/other MCP servers where appropriate (verify transports first). As a server: expose a small, useful toolset (e.g. `create_research_project`, `start_investigation`, `get_investigation_status`, `get_investigation_results`, `list_research_findings`, `get_experiment_results`, `continue_investigation` — names illustrative) so Polygrow and other agents can start/track/retrieve/continue investigations without one long-lived request. Auth + project-level access control. Document for Polygrow.

### 4.9 Data model (Supabase, migrations, RLS)
Candidate entities (create only what the MVP workflow needs): ResearchProject, ResearchTarget, ResearchQuestion, InvestigationRun, InvestigationStep, Finding, Evidence, Hypothesis, Experiment, ExperimentRun, Artifact, Conclusion, UsageRecord (future). Relational where querying/authorization/lifecycle need it — not one JSON blob. Findings belong to investigations; experiments link objectives and implementations; results keep execution context; conclusions reference evidence; artifacts link to their investigation; RLS protects user boundaries; failed/interrupted runs stay distinguishable from successful ones.

### 4.10 Learning engine (MVP-focused)
Explanations grounded in actual investigation results — architecture, flows, component responsibilities, algorithms, alternative comparisons, experiment outcomes, open questions — linked to code, evidence, and artifacts. No generic educational content. Advanced curricula/knowledge graphs are future work.

## 5. Roadmap

**Phase 1 status (2026-10-16, local-only build):** the Phase 1 foundation is
implemented on branch `phase-1-foundation` — shared domain contract
(`src/types.ts`), sandboxed `LocalExecutor` (+ honest `VercelSandboxExecutor`
stub), REA CLI runner with evidence mapping (verified against the real
`rea-agents@6.5.0` output shapes), `FileStore` (+ honest `SupabaseStore`
stub), `samples/mini-kv` probe target with `npm run rea:probe`, and the
Phase 1 API contract (engine-dependent routes return honest `501`).
Build/lint/test green, zero keys required. The investigation engine,
experimental execution, UI, and MCP server are later phases.

- **Phase 0 — Product & Technical Audit** (complete 2026-10-16): understand requirements, audit REA's actual code, validate execution assumptions, identify risks, propose the smallest viable architecture. Deliverables: `docs/product/` (vision, core-workflows, mvp-scope), `docs/research/rea-*` (audit, capability-matrix, integration), `docs/architecture/` (system-architecture, execution-environments).
- **Phase 1 — Technical PoC**: minimal end-to-end path — invoke one verified RE capability, feed it input, interpret output, preserve evidence, run one compatible isolated experiment, store and retrieve the result. One small target. Validate real runtime constraints.
- **Phase 2 — Core data model**: Supabase schema + migrations for projects, targets, runs, findings/evidence, experiments/results, artifacts. RLS. State survives refresh/navigation/recovery.
- **Phase 3 — Investigation engine**: objective → plan → capabilities → execution → progress → findings → plan revision → structured result, on Vercel AI SDK + Gateway. Only the orchestration complexity the validated workflow needs.
- **Phase 4 — Experimental engineering**: define experiment, reference + alternative, isolated test execution, real measurements, comparison, documented conditions. Failures stay visible.
- **Phase 5 — Application UI**: the three views + minimal landing page. Complete one real investigation end-to-end over building every visualization.
- **Phase 6 — MCP integration**: expose operations, validate an external client, document Polygrow usage.
- **Phase 7 — MVP validation**: correctness, traceability, reliability, experiment integrity, persistence, recovery, security, cost awareness, usability, MCP. Document remaining limitations. The MVP is not done because the UI renders.
- **Phase 8 — Commercialization** (out of MVP): Research Credits accounting, Polar, plans, limits, billing events, Resend notifications.

## 6. MVP acceptance criteria (all 15 must hold)

1. Create a Research Project.
2. Define an engineering objective.
3. Start an autonomous investigation.
4. Inspect a supported software target.
5. Use at least one verified reverse engineering capability.
6. Produce findings linked to relevant evidence.
7. Identify a meaningful implementation opportunity.
8. Define an appropriate experiment.
9. Generate an alternative implementation when the objective requires it.
10. Execute compatible tests in an isolated environment.
11. Compare results using real observations or measurements.
12. Explain the findings and limitations.
13. Continue the investigation with a new instruction.
14. Retrieve previous results after returning to the project.
15. Access useful investigation functionality through MCP.

(Not every investigation must generate code or run benchmarks — the system selects operations appropriate to the objective.)

## 7. Engineering principles

Evidence over assertions · existing capabilities over reinvention · experiments over unsupported claims · small complete workflows over broad incomplete features · modular simplicity over premature abstraction · preserve investigation state · make failures explicit · avoid unnecessary infrastructure · protect experimental execution · optimize for technical credibility.

## 8. Standing decisions & constraints

- Repo **public** (Roger's explicit order 2026-10-16; original plan said "initially private" — Roger overrode).
- License **MIT** (Roger's portfolio default; changeable).
- Phase 1 does **not** start until Phase 0 findings + unresolved questions + recommended sequence are presented to Roger.
- Token lacks `workflows` scope → no `.github/workflows/*` via API; CI pending Roger.
- Monetization (Research Credits, Polar, Resend) is **docs-only** until Phase 8. No arbitrary credit prices before measured costs.
- No public extension SDK/marketplace in MVP; document future direction in `docs/architecture/capability-system.md` + `docs/roadmap/post-mvp.md`.
