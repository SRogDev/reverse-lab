# Reverse Lab — Golden Set Scoring Spec (METRICS)

How an investigation is scored against the golden set in
[`cases.jsonl`](cases.jsonl) (targets and fact inventories in
[`README.md`](README.md)). This spec implements Roger's framing:

1. The engine's unsupported statements are *inferences* — score them as
   claims, and score the evidence trail separately from the claims.
2. **Context relevance**: of the evidence the engine collected, how much
   was relevant to what it claimed — and how much of the relevant
   evidence that exists did it find?
3. **Replica fidelity**: a report is good exactly insofar as a
   reconstruction built from the report alone behaves *statistically*
   like the original.

All metrics are computed per case, then aggregated per family and per
run. Nothing in this spec requires a live LLM: §1–§3 (deterministic
parts), §5 and §6 run against the scripted provider today; the
LLM-judge procedure in §3.2 activates when the AI Gateway provider is
configured.

Vocabulary, aligned with `src/types.ts`: a **claim** is one atomic
factual statement extracted from a `Finding` (`title`/`body`) or a
`Conclusion` (`statement`). A claim **cites** the `evidenceIds` attached
to its finding/conclusion. An **evidence record** is an `Evidence` item
(`id`, `source`, `observation`, `verification`, `provenance`).

---

## 1. Claim normalization and matching

Raw report text is not scored directly; it is first reduced to a claim
set by an extractor (human for v1; the process is the same whoever does
it):

1. Split each finding/conclusion into atomic statements (one fact, one
   component, one predicate). Compound sentences yield multiple claims.
2. Normalize each claim to `(component, predicate, value)` form, e.g.
   `(mini-kv expiry, mechanism, lazy-on-read)`. Paraphrase, language
   (EN/ES), and formatting differences must not affect matching.
3. Match normalized claims against the case's `expected_claims` and
   `forbidden_claims` by fact identity (the `fact_ref` in the case),
   not by string similarity. Unmatched claims go to the *unlisted*
   bucket and are judged under §3 (they may be true-but-unlisted, or
   hallucinations — §2.3 separates the two).

A claim counts as **made** if any finding or conclusion asserts it,
including in passing. A claim asserted and later retracted inside the
same report counts as made *and* is flagged `self-contradicted`
(visible in the scorecard; it does not silently cancel out).

## 2. Claim precision and recall

Per case, over expected claims E and the report's claim set R:

- **Claim recall** = |E ∩ R| / |E| — fraction of the known facts the
  investigation actually found.
- **Forbidden hits** = |R ∩ forbidden| — count, reported raw, never
  averaged away. **Any forbidden hit fails the case** regardless of
  other scores: a report that invents persistence for mini-kv is
  wrong in a way recall cannot compensate.
- **Claim precision (strict)** = |R ∩ E| / |R \ unlisted-pending| —
  computed after §3 adjudicates the unlisted bucket: unlisted claims
  judged *supported* move to the numerator (they were true, just not
  pre-registered); unlisted claims judged *unsupported* or
  *contradicted* count against precision.
- **Detection cases (Family C)** use the same formulas with E = the
  single detection claim set of the mutation: recall on the detection
  claim is binary in practice; a report that restates the *original*
  behavior additionally takes a forbidden hit (the case lists it).

Report per case: `claim_recall`, `claim_precision`, `forbidden_hits`,
plus the raw counts. Family aggregates are means of per-case values
**and** total forbidden hits; run aggregates never hide a family
behind the global mean.

## 3. Evidence grounding

### 3.1 Deterministic checks (no LLM, always run)

For every claim in R:

- **Citation presence**: the claim's finding/conclusion has ≥1
  `evidenceIds`. → **Grounding coverage** = % of claims with ≥1 cited
  evidence id. Target for a healthy engine: 100% of non-opinion
  claims; anything below is reported, not rounded.
- **Citation validity**: every cited id exists in the investigation's
  evidence store (content-addressed `lab-ev-<sha256>` ids or REA
  `ev_[0-9a-f]{64}` ids, per the repo's ingest validation). A cited id
  that does not resolve is a **fabricated citation** — scored like a
  forbidden hit (case fails).
- **Lexical entailment screen**: for claims whose `evidence_required`
  names concrete artifacts (a function, pragma, option, file), the
  cited evidence's `observation`/`source` must mention at least one of
  those named artifacts. This is a cheap deterministic filter: it
  cannot prove support, but its failure proves the citation is
  decorative. Claims failing the screen are marked
  `entailment: unscreened-fail` and routed to §3.2 first.

### 3.2 Entailment judgment (LLM judge, calibrated)

For each claim + its cited evidence (and for every unlisted claim,
using the evidence it cites; unlisted claims with no citation are
automatically *unsupported*):

- The judge receives **only** the claim text and the cited evidence
  records' `observation` + `source` — never the target's source code,
  never the golden set. It returns one verdict (structured output via
  the AI SDK provider, same pattern as `AIGatewayProvider`):
  `supports` / `partial` / `contradicts` / `insufficient`.
- **Entailment rate** = claims with verdict `supports` / claims judged.
  `partial` counts 0.5 in a secondary "lenient" rate, reported
  alongside, never instead.
- **Calibration (mandatory before the judge's numbers mean anything):**
  a human labels a subset of ≥30 claim–evidence pairs spanning all
  three verdict classes and at least 3 targets. Report judge–human
  agreement as Cohen's κ on that subset with the raw agreement counts.
  Operating rule for v1 (a design choice of this golden set, to be
  revisited after the first calibration round): **κ ≥ 0.6** → judge
  verdicts are scored as-is; **0.4 ≤ κ < 0.6** → judge verdicts are
  advisory, entailment is human-scored for expected claims; **κ < 0.4**
  → the judge is not used and the failure is reported as a finding
  about the eval setup, not about the engine.
- Judge runs record model id, prompt version, and the calibration
  subset hash in the scorecard. A judge whose calibration is stale
  (different model or prompt than the last calibrated run) produces
  `entailment: uncalibrated` — a visible state, not a number.

## 4. Context relevance (Roger's context precision / recall)

The denominator is the target's **fact inventory**: the numbered facts
(F/Q items) in README Family A, or the claim list in the target's
Family B entry. Each evidence record the engine collected is mapped —
by the same extractor as §1 — to the facts it is *relevant to*
(evidence is relevant to a fact if it could support or refute it;
an evidence record may map to several facts or none).

- **Context precision** = evidence records mapped to ≥1 fact **that the
  report actually claimed** / all evidence records collected.
  (Of what it gathered, how much served its conclusions.)
- **Context recall** = facts in the inventory for which ≥1 collected
  evidence record is relevant / all facts in the inventory.
  (Of what there was to find, how much did it find *evidence for* —
  independent of whether it then claimed it. The gap
  `context recall − claim recall` isolates "found but didn't say"
  from "never found".)
- Also reported: **evidence efficiency** = evidence records collected /
  claims made. No target band in v1 — this is a cost signal for the
  engine's planner, tracked so regressions are visible.

Mapping evidence→facts is extractor work; on the calibration subset
(§3.2) the human also labels the mapping, and inter-rater agreement on
the mapping is reported the same way. Unmapped evidence is not
automatically waste (it may support a true unlisted claim) — it is
counted in precision only after §3 adjudication, exactly like claims.

## 5. Replica fidelity

Protocol (case GS-R-01 is the template):

1. **Isolation**: the reconstruction is built from the investigation
   report (findings, conclusions, limitations) *only*. The builder
   (human or code agent) gets no target source, no target tests, no
   golden-set files. Any clarification the builder needed that the
   report couldn't answer is logged as a **report gap** — gaps are
   scored against the report, and a build that silently guesses is a
   protocol violation, not a fidelity result.
2. **Behavioral probe suite**: a fixed suite of ≥20 probes per target,
   written against the target's public surface *before* seeing the
   reconstruction, covering: every public operation, boundary values,
   error cases, and the target's known quirks (quirks are behavior;
   a faithful replica reproduces them — if the report described the
   quirk and the replica omits it, that is a fidelity miss, scored,
   not excused). Probes are deterministic (seeded/fake clock where the
   target is time-dependent).
   **Behavioral match** = probes with identical outcomes / total probes.
3. **Performance comparison**: for the target's measurable property,
   run the *same* harness against original and reconstruction using
   `src/experiments/runner.ts` semantics: named measurements,
   **n ≥ 30 repetitions** each, environment context recorded
   (`nodeVersion`, `platform`, `arch`), comparison from `rawValues`
   only. Statistics:
   - **Median relative error** = |median_replica − median_original| /
     median_original (primary statistic — robust, unit-free).
   - **Two-sample Kolmogorov–Smirnov test** on the two raw-value
     samples (secondary): report `D` and `p` at α = 0.05. A significant
     KS result with a small median error means the *shape* differs
     (variance/tails) — reported as `distribution: differs-in-shape`,
     not collapsed into the headline score.
4. **Fidelity bands** (per target, both halves required):
   - **Band A**: behavioral match ≥ 95% **and** median relative error
     ≤ 10%.
   - **Band B**: behavioral match ≥ 85% **and** median relative error
     ≤ 25%.
   - **Band C**: anything below — the report is not yet a faithful
     description of the system, whatever its prose quality.
   KS outcome is printed next to the band (e.g. `B (KS: differs)`) and
   never upgrades a band.
5. The fidelity score is a property of the **report** (and secondarily
   of the engine that produced it) — this is the metric that makes
   "our investigation understood the system" a falsifiable statement:
   rebuild from the words, measure the thing.

## 6. Stability

Run the same case twice (same target, same objective, fresh
investigations). Using §1-normalized claim sets R₁ and R₂:

- **Claim-set overlap** = Jaccard(R₁, R₂) = |R₁ ∩ R₂| / |R₁ ∪ R₂|.
- Also report each run's claim recall (§2) — overlap without recall
  hides two equally-empty reports agreeing perfectly.
- Bands: for the **scripted deterministic provider**, expect
  **Jaccard ≥ 0.8**; below that, the nondeterminism is in the
  engine/planner, which is itself a reportable finding. For a **live
  LLM provider**, v1 records the number without a pass band until a
  baseline across ≥5 cases exists — inventing a threshold before a
  baseline would be exactly the kind of unsupported claim this golden
  set exists to catch.

## 7. Scorecard format

One JSON object per case run, appended to the run's results (field
names stable; this is the contract a future harness implements):

```jsonc
{
  "case_id": "GS-P0-01",
  "run_id": "…",               // investigation run id
  "provider": "scripted | <model id>",
  "claim_recall": 0.0, "claim_precision": 0.0,
  "forbidden_hits": 0, "fabricated_citations": 0,
  "grounding_coverage": 0.0,   // §3.1
  "entailment_rate": null,     // §3.2; null + "entailment_state" when uncalibrated
  "entailment_state": "calibrated | advisory | uncalibrated | not-run",
  "context_precision": 0.0, "context_recall": 0.0, "evidence_efficiency": 0.0,
  "measurements": { "…": "matched | shape-only | missed | not-run" },
  "replica": null,             // or {"band": "A|B|C", "behavioral_match": 0.0, "median_rel_err": 0.0, "ks_D": 0.0, "ks_p": 0.0}
  "stability": null,           // or {"jaccard": 0.0, "paired_case": "GS-P0-01"}
  "case_failed": false         // true iff forbidden_hits > 0 or fabricated_citations > 0
}
```

Aggregation rules: family means for the rate metrics; **totals** (not
means) for `forbidden_hits` and `fabricated_citations`; `case_failed`
count always headline. A run summary that reports only averages is
non-compliant with this spec.

## 8. Honesty constraints on scoring itself

- No expected value in any case is a performance number invented in
  advance; expectations are relations (growth shape, direction,
  distributional property) until a first measured baseline exists, at
  which point baselines are recorded *as measurements with dates and
  environment*, not edited into expectations silently.
- If REA (or any capability) cannot process a target, the case result
  is `capability-gap` with the failure visible — never a zero scored
  as an engine-quality result, and never a skipped case.
- Changes to cases, fact inventories, or thresholds after a run are
  versioned edits to these files; scores from before the edit are not
  recomputed retroactively without saying so.
