# Core Workflows — Reverse Lab

The workflows the MVP must support end to end. Each lists trigger, steps, and outputs.

## W1 — Create a research project and define an objective

- **Trigger:** user starts a new investigation.
- **Steps:** user names the project, describes the engineering objective in natural language, attaches research targets (repos, components, features, docs, benchmarks), sets constraints (languages, licenses, what "better" means).
- **Output:** a Research Project with a defined objective, targets, and constraints. The user can edit all of these later.

## W2 — Autonomous investigation

- **Trigger:** user starts an investigation on a project (W1 complete).
- **Steps:** the system builds an internal investigation plan (objective, research questions, targets, required capabilities, planned operations, hypotheses, expected evidence, evaluation criteria, constraints, limitations), selects appropriate reverse-engineering techniques for the objective, executes operations adaptively, revises the plan as evidence arrives, and produces a structured result.
- **Output:** investigation run with staged progress, findings, and conclusions. Simple objectives must not trigger heavyweight techniques (no binary analysis for a source-code question, no benchmarking without a performance question).

## W3 — Inspect a target with verified RE capabilities

- **Trigger:** the investigation plan calls for it.
- **Steps:** the system invokes a verified reverse-engineering capability (see `docs/research/rea-capability-matrix.md`) with a well-formed input, interprets the output, and stores observations as structured evidence.
- **Output:** evidence records (source-code facts, dependency relationships, execution flows, behavioral observations) linked to the investigation and target.

## W4 — Evidence and findings accumulate

- **Trigger:** continuous during W2/W3.
- **Steps:** observations become evidence records with type, source, location, verification status, and limitations; related evidence supports findings; findings support conclusions.
- **Output:** a Knowledge Space where every important conclusion links to its evidence. Uncertainty and contradictions are shown, not hidden.

## W5 — Experiment: from hypothesis to measured comparison

- **Trigger:** the investigation identifies an improvement worth testing.
- **Steps:**
  1. Define an experiment spec (objective, reference implementation, expected behavior, constraints, inputs, measurement targets, environment, procedure, repetitions, acceptance conditions, limitations).
  2. Generate the alternative implementation as an identifiable artifact (behavior to preserve and objective to improve are fixed first).
  3. Execute tests/measurements in an isolated environment under equivalent conditions.
  4. Compare reference vs alternative using real observations or measurements.
  5. Record results with full execution context; failed experiments stay visible.
- **Output:** experiment record with raw measurements, comparison, and an honest verdict (including "the alternative is not better").

## W6 — Continue or redirect an investigation

- **Trigger:** user gives a follow-up instruction on a finished or running investigation ("try a different algorithm", "optimize memory instead", "compare against repo X").
- **Steps:** the system reuses prior findings and experiments, treats old hypotheses as unvalidated until re-checked, and extends the investigation.
- **Output:** a new investigation run linked to the same project, building on prior state.

## W7 — Review results in the Knowledge Space

- **Trigger:** user opens a project after an investigation.
- **Steps:** user navigates architecture explanations, graphs, code references, findings, experiments, measurements, and conclusions — all persisted and associated with the originating investigation.
- **Output:** understanding, grounded in traceable evidence.

## W8 — External agents use Reverse Lab via MCP

- **Trigger:** an external agent (e.g. Polygrow) needs investigation capability.
- **Steps:** the agent calls MCP tools to create projects, start investigations, poll status, and retrieve structured results — without holding one long-lived request open.
- **Output:** structured investigation results consumable by other agents.
