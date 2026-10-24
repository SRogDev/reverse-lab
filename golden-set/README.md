# Reverse Lab — Golden Set v1 (design + target catalogue)

Status: **design + case catalogue, working files (not yet wired into a
scoring harness)**. Created 2026-10-23 from web research + the repo's own
verified capability registry (`src/capabilities/registry.ts`).

A *golden set* is a fixed collection of investigation targets where the
correct answers are known **before** the lab runs, so an investigation's
output (findings with `evidenceIds`, hypotheses, conclusions, experiment
measurements — the shapes in `src/types.ts`) can be scored instead of
eyeballed. Scoring rules live in [`METRICS.md`](METRICS.md); the concrete
cases live in [`cases.jsonl`](cases.jsonl).

Why three families: each family pins down ground truth a different way,
and each catches a different failure mode of an investigation engine.

| Family | Ground truth source | Failure mode it catches |
|---|---|---|
| A. Planted synthetic | We wrote the target; the fact list in this file is the truth | Missed architecture facts, missed planted quirks, invented features |
| B. Real OSS | The project's own docs + test suite (oracle we did not write) | Overfitting to our own toy code; claims that sound plausible but contradict real docs |
| C. Mutation | The injected diff itself | "Looks fine" reports that never notice a real behavioral change |

Rules inherited from the repo (binding):

- **No target is fetched through a GitHub account or the GitHub API.**
  Every OSS target below is obtained as an npm registry tarball
  (`npm pack <name>@<version>`), which needs no account.
- Anything not verified against a real page or registry record in this
  research pass is marked **UNVERIFIED** and must not be cited as fact
  by a scoring harness.
- A claim is only *expected* if its ground-truth source is named. "The
  model probably knows this library" is not ground truth.

## Case schema (`cases.jsonl`)

One JSON object per line:

```jsonc
{
  "id": "GS-P0-01",                    // GS-<family letter><target>-<nn>
  "family": "planted" | "oss" | "mutation" | "replica" | "stability",
  "target": "mini-kv",                 // target id from the catalogue below
  "capability": "rea-javascript-app",  // registry capability under test
  "objective": "…",                    // the objective handed to the lab, verbatim
  "expected_claims": [
    {
      "claim": "…",                    // a statement a correct report must make (paraphrase-tolerant)
      "evidence_required": "…",        // what at least one cited Evidence record must actually show
      "fact_ref": "A-P0-F3"            // id of the known fact in this README
    }
  ],
  "forbidden_claims": ["…"],           // statements that are FALSE for this target; any appearance = hallucination hit
  "expected_measurements": null | {
    "name": "get-latency-scaling",     // what the experiment must measure
    "protocol": "…",                   // how (harness, sizes, repetitions)
    "expectation": "…"                 // the qualitative/quantitative truth to compare against
  },
  "notes": "…"                          // optional: scoring hints, caveats
}
```

Claim matching is paraphrase-tolerant (see METRICS.md §1): a claim counts
as made when a finding/conclusion states the same fact about the same
component, not when it copies the string.

---

## Family A — Planted synthetic targets

We write these ourselves (~50–150 lines of TypeScript each, one file or
one small folder, in the style of `samples/mini-kv`). Because we wrote
them, the fact list **is** the ground truth: every fact is checkable
against the source, and the planted quirk is a real behavior of the code,
not a doc claim. Each target has: known architecture facts (F1…Fn), one
hidden quirk (Q) that a shallow read misses, and one measurable
performance property (M) an experiment can verify.

### A-P0 · `mini-kv` — **already exists** (`samples/mini-kv`, 99 lines)

In-memory KV store with TTL; the lab's REA probe target
(`npm run rea:probe`), capability `rea-javascript-app`.

- **F1** — Storage is a single `Map<string, Entry>`; entries hold
  `{value, expiresAt}` with `expiresAt` an absolute `Date.now()` deadline
  or `null`.
- **F2** — Expiry is **lazy**: checked on `get()` via `isExpired`; there is
  no timer/`setInterval` anywhere.
- **F3** — `sweep()` eagerly evicts all expired entries and returns the
  count removed.
- **F4** — Nothing is persisted: no disk, no serialization; state dies
  with the process.
- **Q (quirk)** — `has(key)` is implemented as `get(key) !== undefined`,
  so (a) a key explicitly set to `undefined` reports absent, and (b)
  calling `has()` on an expired key **deletes it** — a read-named
  operation mutates the store.
- **M** — `get` on a live key is O(1) regardless of store size;
  `sweep()` cost grows linearly with the number of entries.

### A-P1 · `token-bucket-limiter` — TO BUILD (~120 lines), `rea-javascript-app`

Per-key token-bucket rate limiter. Facts:

- **F1** — One bucket per key in a `Map`; bucket = `{tokens, lastRefillMs}`.
- **F2** — Refill is **lazy**, computed from elapsed wall-clock time on
  each `allow(key)` call; no timers.
- **F3** — Capacity and refill rate are constructor constants, identical
  for all keys (no per-key configuration).
- **Q** — Refill credits only **whole** tokens (`Math.floor` on accrued
  tokens) and discards the fractional remainder, so the effective
  long-run rate is strictly below the configured rate whenever checks
  arrive more often than one token period.
- **M** — Under a simulated clock, the number of allowed requests in a
  burst + sustained window is measurable and must match the whole-token
  arithmetic, not the ideal real-valued rate.

### A-P2 · `wildcard-event-bus` — TO BUILD (~130 lines), `rea-javascript-app`

Synchronous pub/sub with segmented topics (`orders.eu.created`) and
single-segment `*` wildcards. Facts:

- **F1** — Subscriptions live in `Map<pattern, Set<handler>>`; matching is
  segment-by-segment, `*` matches exactly one segment.
- **F2** — `emit` is fully synchronous and returns the number of handlers
  invoked.
- **F3** — `once` handlers are removed **before** invocation.
- **Q** — A throwing handler aborts dispatch: remaining handlers for that
  emit never run, and the error propagates to the emitter's caller (no
  per-handler isolation).
- **M** — Dispatch latency grows linearly with the number of matching
  subscriptions (measurable: emit time at 10 / 100 / 1000 subscribers).

### A-P3 · `sqlite-notes` — TO BUILD (~120 lines JS + `schema.sql`), `rea-sqlite`

Notes store backed by a real SQLite file, thin JS repository over a
prepared database fixture. Facts:

- **F1** — Schema: `notes(id, title, body, created_at)`,
  `tags(note_id → notes.id, tag)` with FK constraints declared, and an
  index on `notes(created_at)` only.
- **F2** — The repository opens the DB read/write per operation via a
  single shared connection object; journal mode is the SQLite default
  (`delete`), **not** WAL.
- **F3** — Tag lookup is one query joining `tags` → `notes`.
- **Q** — There is **no index supporting the tag lookup's filter on
  `tags.tag`**, so `findByTag` does a full scan of `tags` whose cost
  grows linearly with total tag rows — invisible in the JS source; only
  visible via `EXPLAIN QUERY PLAN` / measurement.
- **M** — `findByTag` latency at 1k vs 10k tag rows (≈10× growth), and
  `EXPLAIN QUERY PLAN` output showing `SCAN tags` — the experiment
  harness can verify both.

### A-P4 · `retry-queue` — TO BUILD (~140 lines), `rea-javascript-app`

In-memory job queue with exponential backoff + jitter and a dead-letter
list. Facts:

- **F1** — Jobs are held in a plain array FIFO; a failed job is re-queued
  with delay `min(maxDelay, base * 2^attempt) + jitter`.
- **F2** — After `maxAttempts` failures the job moves to a `deadLetter`
  array; nothing is persisted.
- **F3** — Execution is driven by `setTimeout` per pending job (one timer
  per job, no central scheduler loop).
- **Q** — Jitter (`Math.random() * base`) is added **after** the
  `maxDelay` cap, so the actual delay can exceed `maxDelay` by up to
  `base` ms — the documented cap is not a real cap.
- **M** — The empirical delay distribution per attempt (median / max over
  ≥30 runs) versus the formula in F1; the max must reveal Q.

### A-P5 · `markdown-lite` — TO BUILD (~150 lines), `rea-javascript-app`

Line-based mini markdown renderer (headings, lists, fenced code, inline
bold/italic/code/links) producing escaped HTML. Facts:

- **F1** — Single-pass, line-oriented state machine; the only state is
  `inFence: boolean` plus the current list run.
- **F2** — Raw HTML in the input is escaped **before** inline formatting
  is applied.
- **F3** — Inline formatting is regex-based, applied per line, never
  across line boundaries.
- **Q** — An unterminated code fence leaves `inFence` true forever:
  the entire remainder of the document is rendered as one code block,
  silently dropping headings/lists after it.
- **M** — Throughput (chars/ms) on a generated corpus, and fixture
  correctness: a fixed input set with byte-exact expected HTML.

### A-P6 · `session-store` — TO BUILD (~110 lines), `rea-javascript-app`

In-memory session store with sliding expiration and an absolute lifetime
cap. Facts:

- **F1** — Sessions in a `Map<id, {data, createdAt, expiresAt}>`;
  `get(id)` returns data only if `now < expiresAt`.
- **F2** — `touch(id)` slides `expiresAt` forward by the TTL.
- **F3** — An absolute cap `maxLifetimeMs` from `createdAt` is a stated
  design rule (named constant + comment).
- **Q** — The cap is only checked in `create`, **never in `touch`**: a
  session that keeps being touched lives past the absolute cap
  indefinitely. The constant exists; the enforcement doesn't.
- **M** — Under a simulated clock, session survival past
  `createdAt + maxLifetimeMs` with periodic touches (binary outcome plus
  count of live sessions over simulated time).

### A-P7 · `layered-config` — TO BUILD (~120 lines), `rea-javascript-app`

Config loader with defaults < JSON file < environment precedence and
`${VAR}` interpolation. Facts:

- **F1** — Precedence is defaults, then file, then env overrides,
  deep-merged per top-level section.
- **F2** — `${VAR}` interpolation runs over the **file layer before**
  the merge (implementation order matters; see Q).
- **F3** — Unknown keys in the file are rejected against a schema key
  list; missing required keys throw at load.
- **Q** — Because interpolation happens pre-merge, a file value that
  will be **overridden by env anyway** still throws when its `${VAR}`
  is unset — an error for a value that would never be used.
- **M** — Load performs exactly one file read per `load()` (no caching):
  measurable by counting `readFile` calls across repeated loads.

---

## Family B — Real OSS targets (oracle = their docs + tests)

Obtained with `npm pack <name>@<version>` — no GitHub account/API.
Versions, licenses and tarball facts below were read from the npm
registry record for each package on **2026-10-23**
(`https://registry.npmjs.org/<name>/latest`). Documentation claims were
cross-checked against the package's published docs/README mirrors
(sources per target). General caveat: **npm tarballs for several of
these packages ship built output only** — where the test suite is not
in the tarball, the oracle for that target is its documentation plus
behavioral probes we write, and the case says so. "Their tests are the
oracle" applies in full only after fetching the repo test directory by
other legitimate means, which is out of scope while GitHub access is
suspended.

### B-O1 · `lru-cache@11.5.3` — capability `rea-javascript-app`

- Registry: version **11.5.3**, license **BlueOak-1.0.0** (permissive;
  note: older majors were ISC — pin this version), tarball
  `https://registry.npmjs.org/lru-cache/-/lru-cache-11.5.3.tgz`,
  113 files, test runner `tap`. The package exports its **source**
  (`./raw` export → `src/index.ts`), so REA reads real TypeScript, not
  only minified dist.
- Docs: https://isaacs.github.io/node-lru-cache/ (project documentation
  site).
- Claims a correct investigation should be able to make:
  - At least one of `max`, `ttl`, or `maxSize` is **required** —
    unbounded configuration is refused by design.
  - Eviction is least-recently-used; `dispose`/`disposeAfter` callbacks
    fire on eviction/removal with a reason.
  - TTL is supported per-cache and per-item; `allowStale`,
    `updateAgeOnGet`, `ttlAutopurge` change expiry behavior.
  - `fetchMethod`/`fetch()` provide stale-while-revalidate-style async
    loading; keys may be non-string objects compared by identity.
- Oracle files: the docs site above (options/API sections) and the
  package's `src/index.ts` (via `./raw`). The repo `test/` directory is
  **UNVERIFIED** as present inside the npm tarball — do not assume it.

### B-O2 · `p-queue@10.0.0` — capability `rea-javascript-app`

- Registry: version **10.0.0**, license **MIT**, tarball
  `https://registry.npmjs.org/p-queue/-/p-queue-10.0.0.tgz`, **13 files
  (dist + manifest only — its `test/*.ts` suite is NOT in the tarball)**,
  ESM-only, Node ≥ 22.
- Docs: full README mirrored at https://npm.io/package/p-queue and
  https://socket.dev/npm/package/p-queue/overview/9.0.0.
- Claims a correct investigation should be able to make:
  - Four independent constraint mechanisms: `concurrency` (default
    Infinity), `interval`+`intervalCap` rate limiting, per-task
    `priority` (default 0, mutable via `setPriority`), pause/resume.
  - `PQueue` extends an event emitter; lifecycle events include
    `active`, `completed`, `error`, `idle`, `rateLimit`.
  - Timeouts are per-queue/per-task and surface as `TimeoutError`;
    waiting tasks can be aborted via `AbortSignal`.
  - The queue is **in-memory only**: no persistence, no retries of
    failed tasks built in.
- Oracle: README (API section) + `dist/index.d.ts` in the tarball.
  Limitation: without the test suite, doc-vs-code disagreements can
  only be settled by behavioral probes — cases for this target are
  doc-claim cases, marked as such.

### B-O3 · `lowdb@7.0.1` — capability `rea-javascript-app`

- Registry: version **7.0.1**, license **MIT**, tarball
  `https://registry.npmjs.org/lowdb/-/lowdb-7.0.1.tgz`, 29 files,
  single runtime dependency **`steno@^4.0.2`**, test script runs
  `src/**/*.test.ts` (whether `src/` ships in the tarball is
  **UNVERIFIED**; the tarball's documented surface is `lib/`).
- Docs: README mirrored at https://socket.dev/npm/package/lowdb/overview/6.1.0
  (v6 README; v7 API is the same shape — the registry record's exports
  and scripts confirm `Low`, `LowSync`, node/browser adapter split for
  v7).
- Claims a correct investigation should be able to make:
  - Architecture is a tiny core class (`Low`/`LowSync`) over a pluggable
    **adapter** interface (`read()`/`write(data)`); storage is whatever
    the adapter does — JSON file, in-memory, localStorage — the core
    holds data in a plain JS object at `db.data`.
  - Persistence happens **only** on explicit `db.write()`; mutating
    `db.data` alone persists nothing.
  - The bundled `JSONFile` adapter writes through `steno`, i.e. writes
    are atomic (write-temp-then-rename), not direct overwrites.
  - Missing file ⇒ `db.data` is `null` after `read()` (defaults are the
    caller's job via the constructor argument).
- Oracle files: README (API + Adapters sections); the `steno`
  dependency fact is in the registry record cited above.

### B-O4 · `nanoid@6.0.2` — capability `rea-javascript-app`

- Registry: version **6.0.2**, license **MIT**, tarball
  `https://registry.npmjs.org/nanoid/-/nanoid-6.0.2.tgz`, **11 files
  (library only, no test suite in tarball)**, zero dependencies.
- Docs: README mirrored at https://socket.dev/npm/package/nanoid/overview/3.1.23
  (the factual claims below are stable across the mirrored versions;
  size-in-bytes claims differ per version and are **not** used as
  expected claims).
- Claims a correct investigation should be able to make:
  - Default IDs are **21 symbols** from a 64-character URL-safe alphabet
    (`A-Za-z0-9_-`), ≈126 bits of randomness.
  - Randomness comes from a cryptographically strong source (Node
    `crypto` / Web Crypto), **never `Math.random`** in the default
    generator; the byte→symbol mapping avoids modulo bias so the
    symbol distribution is uniform.
  - A `non-secure` variant exists that trades the crypto source for
    speed; `customAlphabet`/`customRandom` allow custom generators.
- Oracle: README (Security + Comparison sections). For this target the
  strongest oracle is behavioral: symbol-uniformity over a large sample
  is directly measurable (see case GS-O4-01 and METRICS.md §5).

### B-O5 · `better-sqlite3@13.0.3` — capability `rea-sqlite`

- Registry: version **13.0.3**, license **MIT**, tarball
  `https://registry.npmjs.org/better-sqlite3/-/better-sqlite3-13.0.3.tgz`,
  68 files, test runner `mocha` (whether the repo `test/` directory
  ships in the tarball is **UNVERIFIED**); native addon (prebuilds /
  node-gyp) — **UNVERIFIED** that REA's sqlite surface ingests this
  package's own files meaningfully; the golden-set use is: build a
  small fixture app + `.db` with it (or with any SQLite writer) and
  investigate *that*, with this package's documented semantics as the
  oracle for the claims.
- Docs: README mirrored at https://socket.dev/npm/package/better-sqlite3
  ("Why should I use this instead of node-sqlite3?" + Performance/WAL
  sections).
- Claims a correct investigation should be able to make:
  - The API is **fully synchronous by design** — presented as a
    performance feature, not a limitation.
  - Full transaction support, including a function form
    (`db.transaction(fn)`) that wraps calls in BEGIN/COMMIT with
    rollback on throw.
  - WAL is **opt-in** via `db.pragma('journal_mode = WAL')`, with a
    documented checkpoint-starvation caveat; prepared statements are
    the primary query API (`.prepare(...).get/.all/.run`).
  - User-defined functions, aggregates, backups and 64-bit integers
    are first-class features (listed in the registry keywords/docs).
- Oracle files: README (Usage, Performance sections).

### B-O6 · `semver@7.8.5` — capability `rea-javascript-app`

- Registry: version **7.8.5**, license **ISC**, tarball
  `https://registry.npmjs.org/semver/-/semver-7.8.5.tgz`, 53 files,
  test runner `tap`. The published file set includes the implementation
  sources (`classes/`, `functions/`, `ranges/`, `internal/`), so REA
  reads real source. The repo's tap test fixtures are **UNVERIFIED**
  as present in the tarball.
- Docs: README function reference mirrored at
  https://socket.dev/npm/package/semver/overview/7.7.3 (7.7.3 mirror;
  function semantics unchanged for the functions cited) and range
  semantics summarized at
  https://www.webcodingcenter.com/node.js/packages-publishing-and-monorepos--semantic-versioning-and-version-ranges.html.
- Claims a correct investigation should be able to make:
  - Parsing is strict: `valid('1.2')` is `null`; `coerce` exists
    precisely because loose strings are otherwise rejected.
  - Range semantics are comparator-set based: `^1.2.3` := `>=1.2.3
    <2.0.0`, but for pre-1.0 versions the caret binds to the leftmost
    non-zero component (`^0.2.0` excludes `0.3.0`).
  - **Prereleases are excluded from ranges by default**: a range only
    admits a prerelease if a comparator with the same
    major.minor.patch names one.
  - `compare` orders prerelease identifiers numerically where possible
    (`rc.2 < rc.10`), not lexically.

---

## Family C — Mutation targets

Take a Family A (or B-derived) target and inject **exactly one** known
change. The diff is the ground truth; the case measures whether the
investigation **detects the change, names the affected behavior, and
cites evidence that actually shows it** — and whether experiment
measurements move the way the diff predicts. A mutation the engine
reports as "no difference" is a false negative with a known cost, which
is what makes this family the sharpest reliability probe we have.

| Id | Base | Injected change (the diff) | Predicted observable effect |
|---|---|---|---|
| C-M1 | `mini-kv` | `get()` stops checking expiry; only `sweep()` evicts | Expired keys return values until a sweep; lazy-expiry fact F2 becomes false |
| C-M2 | planted LRU cache (from A-family cache code) | Eviction removes the **most**-recently-used entry instead of least | Hit-rate collapses on sequential-scan workloads; eviction-order probe flips |
| C-M3 | `sqlite-notes` | Tag lookup rewritten as N+1: one query for note ids, then one query per note | `findByTag` latency grows super-linearly in result count; query count measurable |
| C-M4 | planted ID generator (nanoid-shaped) | Crypto source replaced by `Math.random()` + naive `% alphabet` mapping | Symbol distribution becomes measurably non-uniform (chi-square probe); security claim becomes false |
| C-M5 | `wildcard-event-bus` | Wildcard matching replaced by string-prefix matching | `orders.*` now also matches `orders2.eu`; some one-segment topics stop matching — both directions detectable |
| C-M6 | `token-bucket-limiter` | Refill credited on every `allow()` call instead of by elapsed time | Effective rate becomes call-frequency-dependent; sustained-window count explodes under frequent checks |

Scoring per case (METRICS.md §2–§4 applied to a *detection* claim set):
full credit requires (1) a finding stating the behavioral change,
(2) cited evidence that shows the changed code path or the changed
measurement, and (3) no claim that the *original* behavior still holds.

---

## What is NOT grounded yet (honest gaps)

- **Tarball contents beyond registry metadata** (file counts, export
  maps, scripts) were not unpacked in this research pass. Every
  "test/ ships in the tarball" question is marked UNVERIFIED above;
  resolving them is a 5-minute `npm pack` + `tar -tzf` check per
  package, to be recorded here when the harness is built.
- **REA behavior on the OSS targets is UNVERIFIED**: REA is verified
  (repo README) on `mini-kv`-shaped JS and SQLite targets. Whether
  `rea-javascript-app` produces useful evidence on a 113-file package
  like `lru-cache` (vs its `./raw` source entry) is an empirical
  question the first golden-set run must answer; cases may need
  scoping (e.g. investigate one subsystem) after that run.
- **better-sqlite3 as a direct REA target is the weakest grounding**
  (see B-O5): the plan uses it as fixture-builder + doc oracle, not as
  the investigated codebase.
- No performance numbers appear anywhere in this golden set as
  *expected values*, except where a target's own docs state a property
  (e.g. nanoid's uniformity). Expected measurements are stated as
  shapes/relations (linear growth, ≈10× at 10× rows, distribution
  uniformity) to be confirmed by the harness on first run — inventing
  absolute numbers in advance would violate the repo's honesty rules.

## Sources (all accessed 2026-10-23)

- npm registry records (version, license, tarball URL, file counts,
  scripts, dependencies):
  `https://registry.npmjs.org/lru-cache/latest`,
  `https://registry.npmjs.org/p-queue/latest`,
  `https://registry.npmjs.org/lowdb/latest`,
  `https://registry.npmjs.org/nanoid/latest`,
  `https://registry.npmjs.org/better-sqlite3/latest`,
  `https://registry.npmjs.org/semver/latest`
- lru-cache documentation: http://isaacs.github.io/node-lru-cache/
- p-queue README mirrors: https://npm.io/package/p-queue ,
  https://socket.dev/npm/package/p-queue/overview/9.0.0
- lowdb README mirror: https://socket.dev/npm/package/lowdb/overview/6.1.0
- nanoid README mirror: https://socket.dev/npm/package/nanoid/overview/3.1.23
- better-sqlite3 README mirror: https://socket.dev/npm/package/better-sqlite3
- semver README mirror + range summary:
  https://socket.dev/npm/package/semver/overview/7.7.3 ,
  https://www.webcodingcenter.com/node.js/packages-publishing-and-monorepos--semantic-versioning-and-version-ranges.html
