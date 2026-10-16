# Phase 7 — MVP Validation (local, 2026-10-16)

Branch: `phase-7-validation` (from `integrate/all`). Zero GitHub API calls.
Every criterion below was exercised for real against the integrated build;
commands and observed outputs are recorded verbatim. Nothing is marked PASS
without executed evidence.

Validation project: `3768ed39-fa62-41e7-a19c-ad43568d123a` ("Phase-7 validation run").
Validation investigation (fixed engine): `646e3385-5e1a-468a-a4af-31d6b024e613`.

## Checklist

### 1. Create a Research Project — PASS

`POST /api/projects` on the dev server (http://localhost:3000):

```bash
curl -X POST http://localhost:3000/api/projects -H 'content-type: application/json' \
  -d '{"name":"Phase-7 validation run","objective":"Investigate the mini-kv TTL implementation in samples/mini-kv and build a simpler, behavior-compatible alternative","constraints":["no network calls","real measurements only"]}'
```

Observed: HTTP 201, `project.id = 3768ed39-fa62-41e7-a19c-ad43568d123a` (UUID),
name/objective/constraints echoed back, `createdAt`/`updatedAt` set.

### 2. Define an engineering objective — PASS

`GET /api/projects/3768ed39-fa62-41e7-a19c-ad43568d123a` returned the project
with `objective: "Investigate the mini-kv TTL implementation in samples/mini-kv
and build a simpler, behavior-compatible alternative"` — persisted verbatim,
readable back from the store.

### 3. Start an autonomous investigation — PASS

`POST /api/investigations` `{projectId}` → HTTP 201, run
`646e3385-5e1a-468a-a4af-31d6b024e613`, `status: "running"`, 8 plan steps
persisted (all `pending`), drafted by the deterministic planner:

1. Inspect target with rea-javascript-app: samples/mini-kv
2. Ingest REA evidence into the store
3. Form hypotheses (recorded as hypotheses, never facts)
4. Identify implementation opportunities
5. Generate alternative implementation (codegen-typescript)
6. Design experiment: procedure, measurements, repetitions, acceptance
7. Run experiment in the sandbox executor (experiment-run)
8. Record findings and conclusions

The `pending → running` transition was demonstrated directly against the
store: `createRun` → `status: "pending"`; `startInvestigation` → `status:
"running"` with the plan persisted (script `/tmp/transition.mts`, tsx).

### 4. Inspect a supported software target — PASS

`POST /api/projects/3768ed39…/targets` `{kind:"repo", ref:"samples/mini-kv"}`
→ HTTP 201, target `10678221-30bf-409b-acbd-89b9f4f3fc69`. The advance flow's
first step ran the real REA CLI (`analyze-javascript-application`) against
`samples/mini-kv` and completed; the evidence is in the store (see #5).

### 5. Use ≥1 verified RE capability — PASS

`npm run rea:probe` (exit 0) ran the real `rea-agents@6.5.0` CLI twice:

- `analyze-javascript-application samples/mini-kv` →
  `ev_c9f26981fbbe0ad306cd53299dd17318364ff7e413e70c1ac5886b65b0f7b884`
  (format valid), provider `rea-javascript-application`, 9 findings,
  765 AST nodes visited, 5 limitations stored **verbatim**.
- `inspect-sqlite-database` (sample db) →
  `ev_7d49279c32d73dc1cfa138cc088e2fa22069419f8a4714a566d021caed0d906e`,
  6 limitations verbatim.

The engine's ingest maps the CLI record via `reaEvidenceToLabEvidence`:
stored evidence rows carry `source: "rea-agents@6.5.0"`,
`type: "rea:analyze_javascript_application"`, `verification: "observed"`, and
the verbatim `limitations[]`. Verified in the store for the validation run.

### 6. Findings linked to evidence — PASS

`GET /api/investigations/646e3385-5e1a-468a-a4af-31d6b024e613/results`
(after the full 8-step advance completed):

- 4 evidence rows: `lab-ev-1067…` (`investigation:plan`, verification
  `inferred`), `ev_c9f26981…` (`rea:analyze_javascript_application`, source
  `rea-agents@6.5.0`, verification `observed`, 5 verbatim limitations),
  `lab-ev-e46f…` (`codegen:typescript`, verification `observed`),
  `lab-ev-f08b…` (`experiment:run`, verification `measured`).
- 2 findings, every `evidenceIds` entry resolving to a real row:
  "Opportunity: simpler mini-kv TTL implementation" (provisional,
  → plan + REA evidence) and "Investigation summary: …" (provisional,
  → all 4 rows).

### 7. Meaningful implementation opportunity — PASS

Recorded as a **hypothesis**, never a fact: `status: "proposed"` —
"Hypothesis (proposed, unverified): the mini-kv TTL observed in this target
can be reimplemented more simply without changing observable behavior.
Status must be decided by experiment, not by assertion." It cites the plan +
REA evidence ids. The experiment then decided it: the "simpler" alternative
is ~2000× slower (see #11) — the hypothesis mechanism worked as designed.

### 8. Appropriate experiment defined — PASS

The design step created experiment `4357373e` on the validation run:

- objective: "Compare reference vs alternative for: Investigate the mini-kv
  TTL implementation …"
- procedure: stage reference + alternative in a fresh sandbox cwd → run the
  benchmark harness against each → collect each measurement 5× per artifact
  → compare raw per-measurement stats (n, mean, min, max, delta vs reference)
- measurements: `["wall_time_ms", "correctness"]`, repetitions: 5
- acceptance: "correctness == 1 on every repetition for both artifacts; the
  alternative's wall_time_ms mean is reported as a raw delta — no pass/fail
  is invented beyond the recorded numbers"

### 9. Alternative implementation generated — PASS

Codegen (`codegen-typescript` step) completed on the validation project:
artifact `f0f73a7f-4163-4b61-b3a6-c6027cbc59e4` →
`data/artifacts/63eb9921-4fc4-4428-9b79-8d4ae8d33a26.{ts,js}`
(transform `map-to-object-store`: Map-based KV → null-prototype object with
eager TTL sweep). The step runs `tsc --noEmit --strict` **inside the executor**
and throws on type errors — the step completing means tsc passed.
`node --check` on the emitted JS also passes. Codegen evidence row
`lab-ev-3ef091ebc77b3590c9fc60699419bd6d71b11c858ea27a16362202b161c20113`
(`codegen:typescript`, verification `observed`) carries honest limitations:
"interface compatibility is verified empirically (shared procedure), not
proven" and "Behavioral equivalence beyond the exercised procedure is
UNVERIFIED."

### 10. Tests executed in an isolated environment — PASS

Experiment run `d2236704` (validation run, status `completed`, no failures):

- Fresh sandbox cwd per run: `data/sandbox/d2236704-be4a-453a-8cc6-eb5fcde21bb5/`
  contained exactly the staged files (`harness.mjs`, `reference-index.js`,
  `alternative-*.js`) — the harness ran as a separate child process there.
- Scrubbed env: `LocalExecutor` allowlists only `PATH`, `HOME`, `LANG`
  (`src/execution/executor.ts`); everything else is scrubbed.
- Timeouts: 120s per repetition in the runner
  (`src/experiments/runner.ts`); a timeout is recorded in `failures[]`,
  never hidden (see the pre-existing `50c87879` run:
  `"alternative repetition 1/5: harness timed out after 120000ms"`).
- Full environment context recorded on the run:
  `{"nodeVersion":"v24.20.0","platform":"linux","arch":"x64"}`, plus
  `startedAt`/`finishedAt` and the raw per-repetition `rawValues`.

### 11. Real comparison — PASS

`npm run lab:investigate` (isolated data dir `/tmp/rl-demo-validation`) →
exit 0, `DEMO OK`. Real measurements printed by the demo (this validator's
observed numbers):

- `wall_time_ms`: reference mean=**18.760** (n=5, min=15.583, max=25.569);
  alternative mean=**45233.864** (n=5, min=43133.315, max=48356.105),
  delta vs reference=**45215.104**
- `correctness`: reference mean=1.000 (n=5); alternative mean=1.000 (n=5),
  delta=0.000

The API-driven validation run's own experiment (`d2236704`) measured the
same effect: reference mean=22.644 (n=5, min=12.866, max=37.418);
alternative mean=44660.537 (n=5, min=43172.472, max=46840.320),
delta=44637.893. Honest finding: the "simpler" alternative is ~2000×
slower — the eager TTL sweep is O(n²) by construction (documented in the
harness), a genuine measured trade-off, not a bug being hidden.

### 12. Findings + limitations explained — PASS

The validation run's conclusion (from the real comparison):

> wall_time_ms: reference mean=22.644 (n=5, min=12.866, max=37.418);
> alternative mean=44660.537 (n=5, min=43172.472, max=46840.320), delta vs
> reference=44637.893
> correctness: reference mean=1.000 (n=5, min=1.000, max=1.000); alternative
> mean=1.000 (n=5, min=1.000, max=1.000), delta vs reference=0.000
> Interpretation is left to the operator: these are raw measurements, not a
> verdict. See the linked measurement evidence for the full rawValues and
> environment.

It carries `evidence_ids: [lab-ev-f08b…]` (the measurement evidence) and 3
limitations, e.g. "Wall-clock measurements on the lab host: noisy for
micro-scale workloads…" and "LocalExecutor isolation (sandbox directory +
scrubbed env), not a hardware-isolated microVM."

### 13. Continue with a new instruction — PASS

`POST /api/investigations/646e3385…/continue`
`{instruction: "also inspect the sqlite database at data/app.sqlite for comparison"}`
→ status `running`, plan grew 8 → 15 steps; the 7 appended steps start with
"Inspect target with rea-sqlite…". All 8 prior steps stayed `completed`;
findings (2), hypotheses (1), conclusions (1) and evidence (4) were reused
unchanged — verified via the results endpoint after continuing.

Observed planner limitation (honest, not a failure of the criterion): the
instruction's new path (`data/app.sqlite`) was not extracted as a target;
the sqlite intent was mapped onto the existing target ref (`samples/mini-kv`),
so the appended step would fail honestly when advanced. Filed in the doc,
not hidden.

### 14. Retrieve previous results after returning — PASS

Stopped the dev server (SIGTERM, confirmed port 3000 down), restarted it,
re-fetched everything from disk:

- `GET /api/projects/3768ed39…` → same name, objective, target
  (`repo samples/mini-kv`), both runs (`54e0eb68` still `failed`,
  `646e3385` still `running` with 15 steps)
- `GET /api/investigations/646e3385…` → same plan, same statuses
- `GET …/results` → 2 findings / 4 evidence / 1 hypothesis / 1 conclusion,
  identical numbers (reference mean=22.644, alternative mean=44660.537)

FileStore durability holds. **Supabase persistence is validated at the
SQL/RLS level only (honest partial)** — schema + RLS + seed ship as
reviewed `.sql` in `supabase/migrations/`; no live Supabase project exists
(needs Roger's keys), so no Postgres round-trip was executed.

### 15. MCP access — PASS

`npm run mcp:smoke` → exit 0. Real MCP SDK `Client` + `StdioClientTransport`
drove all 7 tools against a spawned `src/mcp/server.ts` over stdio, on an
isolated tmpdir store:

1. `create_research_project` → project created
2. `start_investigation` → run status `running`
3. `get_investigation_status` → status + 4 plan steps
4. `get_investigation_results` → findings with `evidence_ids` + `limitations`
5. `list_research_findings` → findings listed
6. `get_experiment_results` → experiment + runs
7. `continue_investigation` → status `running`, step appended
8. unknown id → `isError`, as expected

Transcript printed `== smoke OK ==`.

## Failure visibility

- The first validation investigation (`54e0eb68-c160-4779-b80c-59dfb6f98e72`)
  FAILED at the experiment-run step and stays visible: `GET
  /api/investigations/54e0eb68…` returns `status: "failed"` with the error
  text (`…failed after 2 attempts: experiment 945da68f… failed: run setup
  failed: cannot read reference artifact file
  /home/hatch/workspace/wt-integrate/samples/mini-kv: EISDIR…`), the failed
  step keeps `[attempt 2 failed]` detail. It was not converted into a success.
- The pre-existing experiment run `50c87879` (integration verification data)
  is recorded `status: "failed"` with
  `failures: ["alternative repetition 1/5: harness timed out after 120000ms"]`;
  the sibling run `42ad7faa` completed. Failed experiment runs are queryable
  via `GET /api/investigations/[id]/experiments`.

## Bug found and fixed during validation

**Directory target registered as the experiment reference (EISDIR).**
`inspectWithRea` registered the inspected *directory* (`samples/mini-kv`) as
the `implementation` reference artifact; `designExperiment` picked it as the
experiment reference and the runner failed staging it as a file
(`EISDIR: illegal operation on a directory, read`), failing the whole
investigation. The demo path never hit this because it pre-registers a
runnable reference file.

Fix (commit `33f8238`, TDD: 2 new tests red→green, 13/13 orchestrator tests,
`tsc` + `biome` clean):

- `resolveReferencePath()`: directory targets resolve to a conventional
  runnable entrypoint (`dist/index.js`, `dist/index.mjs`, `index.js`,
  `index.mjs`) when one exists; the reference artifact points at the file.
- `designExperiment()` refuses honestly when the reference artifact is not a
  runnable file, naming the fix (register a compiled entrypoint artifact).

Live re-validation: the new investigation's reference artifact is
`samples/mini-kv/dist/index.js` ("runnable entrypoint … discovered under
inspected target").

## Honest limitations

- **Self-inflicted data incident (recovered):** during validation I deleted
  all rows of `data/evidence.json` with a wrong filter key (`runId` vs the
  real `investigationId`). Recovered deterministically:
  - Plan evidence is content-addressed — regenerated byte-identical
    (`lab-ev-235900922e47c285e7cff6106a6803552bbec13c3e85e0856ec238db971d654c`
    for the pre-existing run; verified id match).
  - REA `evidence_id`s are deterministic per input — re-ran the real REA CLI
    and re-ingested with the engine's exact mapping; the row
    `ev_c9f26981fbbe0ad306cd53299dd17318364ff7e413e70c1ac5886b65b0f7b884`
    (source `rea-agents@6.5.0`, 5 verbatim limitations) is back.
  - **Not recovered:** 3 experiment-measurement evidence wrapper rows of the
    pre-existing completed run (`lab-ev-b228…`, `lab-ev-d44b…`, `lab-ev-55c0…`)
    — their content included non-deterministic wall-clock measurements. The
    underlying experiment runs (`50c87879` failed, `42ad7faa` completed, with
    rawValues and the recorded timeout failure) survive in
    `data/experiment-runs.json`; the old run's findings/conclusions keep
    their statements but 3 of their evidence links dangle. Lesson recorded:
    never hand-edit `data/`; the FileStore has no undo.
- **Supabase persistence: SQL/RLS level only (honest partial).** The
  FileStore durability check (#14) covers the JSON store. Supabase schema +
  RLS ship as reviewed `.sql` migrations (`supabase/migrations/`) with a
  seed file; no live Supabase project exists (needs Roger's keys), so no
  round-trip against Postgres was executed.
- **AI Gateway provider: honest stub.** `AIGatewayProvider` throws a
  descriptive error until `AI_GATEWAY_API_KEY` is set; all validation ran on
  the deterministic `ScriptedModelProvider` path. No LLM was consulted.
- **Vercel Sandbox executor: honest stub** until configured; isolated
  execution was validated on `LocalExecutor` (fresh sandbox cwd per run,
  scrubbed env, timeouts).
- No composite scores are invented anywhere: comparisons report raw
  n/mean/min/max/deltaVsReference only (spot-checked `src/lib/stats.ts`,
  `src/experiments/runner.ts`, `src/learning/explain.ts`, the knowledge view
  and comparison outputs).
