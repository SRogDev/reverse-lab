# LLM codegen — contract-first synthesis for the single orchestrator

Status: implemented 2026-10-23 on local branch `feat/llm-codegen`
(`src/artifacts/llm-codegen.ts`, capability `codegen-llm-typescript`).
**UNVERIFIED: everything about real-model synthesis quality.** No live
model run has been performed — this environment has no AI Gateway key.
All behavioral tests use a fake provider through the `ModelProvider`
seam. What is verified: the contract plumbing, the extraction rules,
the sandbox verification loop, the attempt budget, the honesty gates,
and the artifact/evidence registration.

## Why this exists

Reverse Lab is a **single-orchestrator** system (the plan's §5 stages —
research, analysis, code — are conceptual responsibilities of one
orchestrator, not independent agents). Until now the orchestrator's
"throw code" ability was exactly one deterministic template transform
(`codegen.ts`: `map-to-object-store`). That is enough to demonstrate the
experiment loop, but not to investigate arbitrary mechanisms.

`llm-codegen.ts` gives the orchestrator general, contract-bound
synthesis for **investigation-grade implementations**: small,
self-contained TypeScript modules an experiment can measure against a
reference. Full application reproduction is explicitly NOT this
capability's job — that stays with external coding agents
(Claude Code / OpenCode).

## The contract comes first (plan §8)

No generation happens without a `CodegenContract`, fixed before the
first prompt:

| Field | Meaning |
|---|---|
| `behaviorToPreserve` | Observable behavior of the reference the alternative must keep |
| `objective` | What the alternative is for (usually the investigation objective) |
| `constraints[]` | Hard constraints (project constraints + module rules) |
| `requiredTests[]` | Executable probe tests (`node <probe> <implJsPath>`, exit 0 = pass) |
| `evaluationProcedure` | How success is judged (tsc now, experiment comparison later) |
| `targetContract` | The TS interface/signature the module must satisfy |
| `hypothesisId?` | The hypothesis the alternative tests |

The orchestrator builds this contract from the run (behavior/objective
from the objective, constraints from the project, evaluation = tsc at
generation time + the experiment step's behavioral comparison). It
ships **no probe tests at orchestrator level** — behavioral judgment
belongs to the experiment, not to generation. Callers of the module
directly (tests, future tooling) can ship probes.

## The loop

1. **Prompt** the provider with the contract and a strict output format:
   exactly one fenced ```ts block, no prose outside the fence.
2. **Extract** the first fenced block (`ts` / `typescript` / bare).
   Fence-stripping is the ONLY permitted cleanup. No usable fence =
   failed attempt (`extract` stage) — never silently repaired.
3. **Write** the source through the Executor into the artifacts sandbox
   dir (`<dataDir>/artifacts/<artifactId>.ts`).
4. **Verify** through the Executor: `tsc --noEmit --strict`, CommonJS
   emit, then each contract probe as a child process.
5. **Repair**: on failure, the next prompt carries the failing stage
   and the compiler/test output. Bounded by
   `MAX_GENERATION_ATTEMPTS = 3` total attempts.
6. **Register** on success: an `implementation` Artifact (description
   starts with `Alternative implementation`, which is how experiment
   design finds it) + `codegen:llm-typescript` evidence recording the
   provider/model, attempts used, every attempt's stage/outcome, the
   tsc result, and probe results. On exhaustion: failure evidence is
   recorded and an explicit `{ status: "failed", lastError }` is
   returned — **no artifact is registered**.

## Provider honesty

- Synthesis requires a real model. When the active provider is the
  deterministic `ScriptedModelProvider` (or none is wired), the module
  returns `{ status: "unavailable", reason }` **without calling the
  provider and without writing any file** (`canSynthesize` in
  `model.ts`). Canned text is never routed into codegen and called
  generated code.
- `AIGatewayProvider` without `AI_GATEWAY_API_KEY` keeps its existing
  honest error; inside the loop it surfaces as a `provider`-stage
  failed attempt and becomes the `lastError` on exhaustion.
- Planning mirrors execution: the planner selects
  `codegen-llm-typescript` only when `canSynthesize` holds; otherwise
  the plan keeps `codegen-typescript` (template) and records the
  unavailability in the plan's limitations, which render verbatim in
  the UI.

## Safety

Generated code is untrusted. It is only ever **written** through the
Executor (which refuses paths outside its sandbox root) and only ever
**executed** by Executor child processes with scrubbed environment and
timeouts — the same boundary as experiment runs. The lab process never
imports, requires, or evaluates generated code; a test proves this by
synthesizing a module whose import has a global side effect and
asserting the flag is never set in the test process while the probe
(which runs the compiled file in a child process) still passes.

## What is UNVERIFIED

- Real-model synthesis quality, repair-loop usefulness, and cost — all
  await Roger's AI Gateway key and a live run.
- Whether real models reliably obey the single-fence output format.
- Behavioral equivalence of synthesized alternatives beyond probe
  tests and the experiment comparison (stated in the evidence
  limitations of every synthesis, success or failure).
- The orchestrator-level `targetContract` is prose ("interface-
  compatible with the reference; exact interface UNVERIFIED at
  generation time") until an investigation supplies a concrete one.

## Tests (all $0, no network, no keys)

`src/artifacts/llm-codegen.test.ts` — (a) broken-then-fixed fake
provider: artifact registered, `attempts = 2`, evidence shows the tsc
failure then the pass + probe results; (b) always-broken provider:
exactly 3 attempts (a 4th canned success is never consumed), explicit
failure, zero success artifacts, failure evidence recorded;
(c) scripted provider: unavailable with reason, provider never called,
zero files written; (d) prose-only responses: 3 failed `extract`
attempts. Plus planner/orchestrator dispatch tests (selection,
fallback + limitation, step execution) and the registry honesty test.
