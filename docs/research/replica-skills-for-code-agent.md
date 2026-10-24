# Replica skills → Reverse Lab code agent

**What this is:** how the vendored replica-skills (`vendor/replica-skill/`, MIT, © Jake Schincariol — provenance in `vendor/replica-skill/UPSTREAM.md`) map onto Reverse Lab's investigation/codegen pipeline, so the lab's code agent works the same pipeline — adapted from *apps* (screens/flows) to *systems* (code/behavior).

## Why they fit

The replica pipeline and the lab pipeline are the same shape:

```
replica:  recon → architect → design → build → backend → test → diff
lab:      investigate (REA + planner) → hypothesize → codegen → experiment → compare
```

The replica skills bring field-tested prompt structure for the stages the lab
currently does with thinner prompts (especially recon discipline and the diff
scorecard). The lab brings what replica does not have: evidence-addressed
claims, sandboxed real measurements, and a golden set
(`golden-set/METRICS.md`).

## Stage mapping

| Replica skill | Lab stage | What we take | What we do NOT take |
|---|---|---|---|
| `replica-recon` | Investigation planning + REA inspection | The recon-map discipline: inventory first (screens/flows ⇒ modules/APIs/data stores), a feature matrix with must/should/could, explicit out-of-scope marking ("their network is not a feature" ⇒ third-party services are environment, not target) | UI/screenshot recon; the lab recons code and behavior, not pixels |
| `replica-architect` | Hypothesis + experiment design | Boring-stack bias, schema-with-constraints thinking, "one vertical slice end-to-end first" build order | Product stack choices (the lab's alternative must match the *target's* contract, not a favorite stack) |
| `replica-design` | — | Nothing directly | Design tokens/UI specs are out of scope for the lab |
| `replica-build` | Codegen (`src/artifacts/codegen.ts`) | Screen-by-screen ⇒ contract-by-contract ticking against the feature matrix; every line written fresh (clean-room), never copied from the target | — |
| `replica-backend` | Codegen (systems) | Official-APIs-only rule; security checklist habit | Payments/auth product wiring |
| `replica-test` | Experiment runner (`src/experiments/runner.ts`) | Flow-derived test plans, severity-graded bug log, "no S1/S2 open" as an exit gate ⇒ probe suites derived from the recon inventory, failures stay visible (lab honesty rule already matches) | Playwright/UI clicking |
| `replica-diff` | **Replica fidelity scoring** (`golden-set/METRICS.md` §5) | The parity-score idea itself: weighted must/should/could feature parity + an explicit missing list, reported as a scorecard | Its *implementation* of parity (feature checklist + screenshot diff): the lab's diff is harder — behavioral probes + performance distributions against the original, because our targets are systems, not screens |
| `replica-entrepreneur` | Knowledge Space / conclusions | The method: real user complaints, counted, every quote verbatim and linked, turned into a fix plan. For the lab: mining a target's issue tracker/reviews (public sources only) as *investigation input* — known pain points become hypotheses with citations | Using it as marketing positioning; in the lab it feeds evidence, not copy |
| `replica-brand` | — | The sweep idea only: before a reconstruction is presented, sweep it for target names/trademarks (their `sweep.py` is a usable pattern) | Rebranding as a product step |
| `replica-launch` / `replica-deploy` | — | Nothing | Product launch/shipping is not the lab's job |

## Rules that carry over verbatim

Replica's clean-room guardrails match the lab's honesty rules and are adopted
as-is for any reconstruction work:

- Rebuild what a system **does**, never what it **owns** (no target code,
  assets, copy, or content in the reconstruction).
- Read only public surfaces and the operator's own accounts/artifacts; no
  paywall bypass, no scraping behind a login.
- Every claim in the recon/fix plan cites its source (a review quote links
  out; a lab claim cites an `evidence_id`).

## Integration notes (for whoever wires this in)

- The code agent's prompts live with the engine (`src/investigation-engine/`,
  `src/artifacts/`). Adaptations of a replica stage should be written as lab
  prompts there, citing this doc — **do not edit the vendored skills**; they
  are the upstream reference and must stay diffable against upstream.
- `replica-diff/parity.py` and `replica-brand/sweep.py` are small,
  dependency-free Python tools; their *scoring/sweep logic* can be re-implemented
  in TypeScript for the lab if a stage needs them (MIT permits it; keep the
  copyright notice where code is adapted).
- UNVERIFIED: none of the 11 skills has been executed inside the lab yet.
  First integration step: run one investigation of a golden-set planted target
  with recon-map discipline added to the planner, and compare claim
  precision/recall against the pre-adaptation baseline.
