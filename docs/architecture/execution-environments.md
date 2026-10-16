# Execution Environments — Vercel Sandbox feasibility audit

**Phase 0 · Audit only · No implementation**
Date: 2026-10-16. Sources are official Vercel docs only (fetched 2026-10-16).
The docs site has moved the product section from `/docs/vercel-sandbox` to **`/docs/sandbox`**;
`/docs/vercel-sandbox` now returns a redirect/404 page pointing at `/docs/sandbox`.

## Pages read (all `https://vercel.com`, machine-readable `.md` endpoints)

| Page | URL | `last_updated` (per page) |
|---|---|---|
| Vercel Sandbox (overview) | `/docs/sandbox` | 2026-09-22 |
| Understanding Sandboxes (concepts) | `/docs/sandbox/concepts` | 2026-08-25 |
| Pricing and quotas | `/docs/sandbox/pricing` | 2026-09-10 |
| JS SDK reference | `/docs/sandbox/sdk-reference` | — (no frontmatter date in fetched copy) |
| Python SDK reference | `/docs/sandbox/python-sdk-reference` | — |
| CLI reference | `/docs/sandbox/cli-reference` | — |
| Sandbox firewall | `/docs/sandbox/concepts/firewall` | 2026-09-16 |
| AI SDK docs index (full llms.txt) | `https://ai-sdk.dev/llms.txt` | — |
| AI Gateway | `/docs/ai-gateway` | — |
| Supabase Row Level Security | `https://supabase.com/docs/guides/auth/row-level-security` | — |

> NOT read (not needed for Phase 0 verdict, but relevant later):
> `/docs/sandbox/quickstart`, `/docs/sandbox/concepts/persistent-sandboxes`,
> `/docs/sandbox/concepts/snapshots`, `/docs/sandbox/concepts/drives`,
> `/docs/sandbox/concepts/images`, `/docs/sandbox/concepts/regions`,
> `/docs/sandbox/concepts/multi-agent`, `/docs/sandbox/concepts/tags`,
> `/docs/sandbox/working-with-sandbox`, `/docs/sandbox/concepts/secure-compute`,
> `/docs/sandbox/mount-remote-storage`, `/docs/sandbox/ecosystem`.
> All were referenced by the pages above; specific claims about them are marked
> UNVERIFIED in this document.

---

## 1. What Vercel Sandbox is (per docs)

Vercel Sandbox is a **generally available** product that provisions isolated Linux
environments as **Firecracker microVMs with a dedicated kernel per sandbox**
(stronger isolation than Docker containers, designed for untrusted code). Startup
is in the millisecond range. SDKs: `@vercel/sandbox` (JS/TS) and
`vercel.sandbox` (Python package `vercel`); plus a `sandbox` CLI.

Key product facts, each sourced from the pages above:

- **Default image** `vercel/sandbox/universal` includes current Node.js LTS,
  **Python 3.14**, coding agents, and common utilities, with **full root access**.
  Custom OCI images can be booted from Vercel Container Registry (VCR); snapshots
  can be used as boot sources.
- **SDK execution surface** (`/docs/sandbox/sdk-reference`): `Sandbox.create()`
  (optional `name`, `timeout`, `source: snapshot`), `runCommand()` blocking or
  `detached` (with log streaming, env vars, `sudo`, cwd), `mkDir()`,
  `writeFiles()` (upload), `readFile()` / `readFileToBuffer()` /
  `downloadFile()` (pull artifacts back), `stop()`, `extendTimeout()`, and
  `Sandbox.get()` to reconnect/resume a named sandbox from another process.
  CLI equivalents: `sandbox create`, `sandbox exec --`, `sandbox stop`.
- **Docker inside the sandbox is explicitly supported** ("System-privileged
  processes": run container runtimes, VPN clients, FUSE drivers with `sudo`).
- **Persistent by default**: on `stop()` the SDK auto-snapshots the filesystem;
  resuming restores filesystem + sandbox configuration. Non-persistent sandboxes
  discard the filesystem on stop.
- **Drives** (persistent filesystem storage, attachable to up to 4 per run) and
  **Snapshots** exist for state that outlives sandboxes; mounting remote object
  stores via FUSE is documented (`/docs/sandbox/mount-remote-storage`).

## 2. Capability / limits table

| Dimension | Value (per docs) | Source |
|---|---|---|
| Isolation | Firecracker microVM, dedicated kernel, private filesystem + network namespace | `/docs/sandbox/concepts` |
| Runtimes | Any Linux (default Ubuntu-based); Node.js LTS + Python 3.14 in default image; any distro / custom image via VCR | `/docs/sandbox` |
| Languages for generated code | Node.js LTS, Python 3.14 out of the box; any language installable via package manager (`apt`, `npm`, `pip`, …) with root | `/docs/sandbox/concepts` |
| Default session timeout | **5 minutes** (configurable at creation; extendable via `sandbox.extendTimeout()`) | `/docs/sandbox/pricing` |
| Max session duration — Hobby | **45 minutes** per session | `/docs/sandbox/pricing` |
| Max session duration — Pro/Enterprise | **24 hours** per session | `/docs/sandbox/pricing` |
| Max vCPU / memory | Hobby: 4 vCPU / 8 GB · Pro: 8 vCPU / 16 GB · Enterprise: 32 vCPU / 64 GB | `/docs/sandbox/pricing` |
| Ephemeral disk | **64 GB NVMe** per sandbox (SDK ≥3.0.0 or custom image) | `/docs/sandbox/pricing` |
| Concurrency | Hobby: **10** · Pro/Enterprise: **10,000** concurrent sandboxes | `/docs/sandbox/pricing` |
| Hobby monthly free tier | 5 Active-CPU hours · 420 GB-hours memory · 5,000 creations · 20 GB data transfer · 10 concurrent · 45-min sessions (creation *pauses* when exhausted) | `/docs/sandbox/pricing` |
| Pro CPU rate (iad1 example) | $0.128/hour Active CPU; $0.0212/GB-hour provisioned memory; creations $0.60/1M | `/docs/sandbox/pricing` |
| Active CPU billing | Charged only for CPU actually used; I/O wait (LLM calls, network) is **not** billed | `/docs/sandbox` + `/docs/sandbox/pricing` |
| "Build and test" 30-min example | ~$0.11 at 10% CPU, 4 vCPU/8 GB (Pro, iad1) | `/docs/sandbox/pricing` |

> The sandbox product is GA; the pricing page's changelog links mention it
> becoming GA ("Vercel Sandbox … now generally available").

## 3. Persistence & networking findings

**Persistence.**
- Sessions are **ephemeral by nature**: "Since sandboxes are ephemeral, they do
  not persist data long-term" (Data privacy, `/docs/sandbox/concepts`).
- **Default = persistent sandboxes**: filesystem auto-snapshotted on stop,
  restored on resume — but this is *session-to-session* persistence, not durable
  storage. Docs explicitly warn: *"Sandboxes are not designed to run
  continuously"* and the filesystem *"isn't a substitute for a database or
  object store. Push large or shared data to external services."*
- **Snapshot expiry**: snapshots expire **30 days after last use** by default
  (configurable, can be kept indefinitely).
- **Drives** (beta; public beta per changelog) provide persistent filesystem
  storage attachable across runs — plausible durability layer, UNVERIFIED in
  detail (concepts page not read).
- **Practical implication**: sandbox-local artifacts (evidence files,
  measurements) must be **pulled back via `readFile`/`downloadFile` (or pushed
  to S3/Supabase) before the sandbox is deleted**; never treat a sandbox as the
  system of record. Snapshot expiry means you cannot rely on "resume that old
  experiment environment" beyond 30 days without explicit retention config.

**Networking.**
- **Default policy is `allow-all`**: unrestricted outbound Internet; docs
  explicitly state packages can be installed from public registries (npm, PyPI)
  and API calls made.
- **Ingress/outbound billing**: data a sandbox *downloads* (packages, Git repos,
  datasets) is **free**; data it *sends* to the Internet plus traffic on exposed
  ports is billable.
- **Firewall page**: three modes (`allow-all`, `deny-all`, and — per the page's
  "three distinct modes", a restricted/allowlist mode; can be **updated at
  runtime without restart**). This maps cleanly to a RE workflow: phase 1
  `allow-all` (clone repo, install deps), then lock to `deny-all` for running
  untrusted reverse-engineered binaries. Firewall rules can be set via
  [`sandbox.firewall()`-style API — UNVERIFIED exact method name; see
  `/docs/sandbox/concepts/firewall`].
- HTTPS from the sandbox goes through a **sandbox proxy with a per-sandbox CA**
  auto-installed in the system trust store (env vars like `SSL_CERT_FILE`,
  `PIP_CERT` are set). **Containers run inside the sandbox do NOT inherit the
  proxy CA** — must be mounted manually (docs give the Docker recipe).
- Exposed ports get a public URL (useful for live previews of PoC servers).
- Secure Compute network attachment (static IPs, VPC peering) exists — overkill
  for the PoC, UNVERIFIED in detail.

---

## 4. PoC feasibility verdict — (a) (b) (c)

The Phase 1 PoC needs: **(a)** run a verified RE capability (e.g., static-analysis
CLI over a small repo), **(b)** run generated TypeScript/Python + a small test
suite in isolation, **(c)** return structured artifacts (files, measurements).

| Requirement | Verdict | Evidence |
|---|---|---|
| (a) Static-analysis CLI over a small repo | **YES** | Root access; install any binary via package manager; 64 GB ephemeral disk; outbound network free for downloads; custom images via VCR or snapshot-after-setup to skip repeat installs; Docker-in-sandbox supported for toolchains needing containers |
| (b) Isolated TS/Python execution + test suite | **YES** | Default image ships Node.js LTS + Python 3.14; `runCommand` with cwd/env/exit codes + stdout streaming; Firecracker isolation is explicitly designed for untrusted code; detached commands + log streaming for long test runs |
| (c) Structured artifacts back to the app | **YES** | `readFileToBuffer()` / `downloadFile()` / `readFile()` pull files back programmatically; stdout/stderr captured per command; artifacts can be pushed to S3/Supabase from inside the sandbox |

**Overall: YES — Vercel Sandbox can do all three today.** The documented KB
guides even cover the exact adjacent pattern ("Run Terminal-Bench and any Harbor
benchmark on Vercel Sandbox", "Run Python code securely with AI SDK and Vercel
Sandbox").

## 5. Gaps found (per docs) + smallest-viable alternatives

1. **Duration cap per session (45 min Hobby / 24 h Pro).**
   A long reverse-engineering run (big repo scan, fuzzing campaign, model
   training for an experiment) can exceed one session. However: the limit applies
   **per session, not per sandbox** — "the limit resets every time a sandbox
   stops and resumes, so the total lifetime of a persistent sandbox is
   effectively unbounded." Long jobs can be chunked (checkpoint artifacts,
   resume).
   *Smallest viable alternative:* **chunked orchestration + persistent-sandbox
   resume** — no new infra. If chunking is unacceptable, docs point to
   **Vercel Workflow + `WorkflowAgent`** (AI SDK's `@ai-sdk/workflow`) for
   durable, resumable long-running agents — still no new infra beyond Vercel.
   A dedicated container worker (e.g., a small VPS/Hetzner-class VM with Docker)
   is the fallback if >24h truly-continuous runs are needed; keep it as a
   Phase ≥2 option only, since it reintroduces infra ops.

2. **Ephemeral by design; snapshots expire after 30 days of non-use.**
   A sandbox is not the system of record. Evidence must be exported.
   *Smallest viable alternative:* **pull artifacts into Supabase (Postgres +
   Storage) immediately after each run** — already the planned data layer; no
   new service. Configure snapshot retention explicitly if 30-day reuse matters
   (UNVERIFIED: retention config lives in `/docs/sandbox/concepts/snapshots`,
   not read).

3. **Default image bloat / cold-setup cost.**
   `vercel/sandbox/universal` includes coding agents and many utilities; installing
   a bespoke RE toolchain (e.g., Ghidra, radare2, semgrep, custom binaries) on
   every fresh sandbox costs minutes.
   *Smallest viable alternative:* **build one custom image in Vercel Container
   Registry (VCR) with the RE toolchain pre-installed**, or snapshot once after
   setup and boot from that snapshot ("Skip dependency installation on
   subsequent runs"). No new infra.

4. **Cost is metered and uncapped-by-default on Pro.**
   Orchestrator bugs (infinite `runCommand` loops) can burn Active CPU; Pro
   charges against the $20/month credit then bills.
   *Smallest viable alternative:* **Spend Management alerts/pauses + short
   `timeout` values + `sandbox.stop()` when done** (all documented). No new infra.

5. **Non-issues worth noting explicitly:** outbound network is ON by default
   (no gap for package installs / cloning repos); downloads are free (no gap for
   pulling a small repo); concurrent sandboxes 10 on Hobby is plenty for a PoC
   but note the 5 Active-CPU-hours/month Hobby cap when budgeting — a handful of
   30-min 2-vCPU runs exhausts it, so **use Pro (or budget $20 credit) for any
   real PoC**.

**Not a gap for the PoC, but an architectural decision to record:** long,
multi-step investigations should not be orchestrated from a plain Vercel
Function waiting on the sandbox — the official pattern in the KB guides is
**AI SDK (ToolLoopAgent) + AI Gateway + Sandbox**, and for durability
**Vercel Workflow + WorkflowAgent**. See §6.

---

## 6. Orchestration & Data Layer Sanity Check

### 6.1 Supabase Postgres + RLS for per-user project isolation

**Verdict: YES, RLS is the right mechanism — with standard gotchas.**

- Postgres RLS is designed exactly for this: policies act as an implicit
  `WHERE` clause on every query (Supabase docs, `guides/auth/row-level-security`).
  Per-user isolation of projects, evidence rows, and experiments is the canonical
  pattern: `using (auth.uid() = user_id)` (or via a `project_members` join for
  multi-user projects).
- RLS runs **inside the database**, so it protects data reached through
  third-party tooling — genuine defense-in-depth, which matters for a lab whose
  evidence store may be touched by multiple services.
- The docs prescribe a per-table checklist: enable RLS → set grants →
  one policy per operation → `supabase/tests/*.sql` assertions → `supabase test db`.
  Adopt this checklist for every table in the schema.

**Gotchas for this use case (all from the Supabase RLS doc):**

1. **Grants ≠ policies.** On existing projects, new tables in `public` grant
   `select/insert/update/delete` to `anon` and `authenticated` *by default*;
   "Adding policies doesn't remove them" — a table protected only by policies
   still hands `anon` an insert path if grants aren't revoked. For a PoC, create
   tables, enable RLS, and explicitly set grants per role.
2. **`service_role` bypasses RLS.** The server-side orchestrator that writes
   evidence/measurement rows must use the `service_role` key and therefore owns
   enforcement — any code path using it is trusted code. Keep browser/edge code
   on the anon key only.
3. **Views bypass RLS by default** (Postgres creates them `security definer`
   with the `postgres` user). Any analytics/summary view over evidence tables
   will leak rows its policies were meant to withhold — create views safely or
   don't expose them through PostgREST.
4. **Performance**: always wrap `auth.uid()` in a subselect `(select auth.uid())`
   in policies so it's evaluated once per query, not per row (documented
   pattern).
5. **RLS must be enabled on EVERY table in an exposed schema** — "A table in an
   exposed schema without RLS is readable and writable by any role with a grant
   on it." Make this a migration lint rule.

None of these is a reason to avoid RLS; they are the reason to follow the
documented checklist rather than "enable RLS and assume".

### 6.2 Vercel AI SDK + AI Gateway for the investigation orchestrator

**Verdict: YES for multi-step agentic tool-calling loops.**

- The AI SDK's **`ToolLoopAgent`** (docs: `ai-sdk.dev/docs/agents/building-agents`)
  exists precisely for this: declare `model`, `tools` (zod-typed), optional
  `instructions`; the SDK runs the generate→tool-call→generate loop for you.
  There is even a documented `experimental_sandbox` integration pattern for
  tools that delegate execution to a sandbox.
- **Loop control**: default `stopWhen: isStepCount(20)`; configurable with
  `stopWhen` conditions (step counts, custom predicates, combinable). Sufficient
  for an investigation orchestrator with a per-investigation step budget.
- **Relevant limits / state semantics:**
  - `runtimeContext` flows through **one agent invocation's loop** and is
    available in `prepareStep`, lifecycle callbacks, and tools — it is the
    right place for server-side state (tenant, request IDs, credentials passed
    via `toolsContext`/`contextSchema` so they never reach the model prompt).
    It is **in-memory per invocation**; the SDK does **not** persist it across
    requests.
  - **"The server does not persist conversation state between requests"**
    (useChat pattern doc). For a long investigation spanning many HTTP
    requests, **the app must persist loop state (messages, step log) itself —
    Supabase is the natural store** — and rebuild the agent context per step.
  - For durable/resumable orchestration, the SDK ships **`WorkflowAgent`** in
    `@ai-sdk/workflow`: same agent loop as `ToolLoopAgent` **plus automatic
    state persistence, tool-schema serialization, and tool approvals that
    survive workflow step boundaries**. This is the documented answer to
    "investigation must survive process restarts / exceed 24h".
  - Memory (long-term, cross-investigation) is explicitly **not built into the
    SDK** — the docs route you to memory providers (Letta, Mem0, Supermemory,
    MongoDB Atlas memory tier) or a custom memory tool. The planned Supabase
    evidence/learning layer covers this; no memory vendor needed for the PoC.
- **AI Gateway** (`/docs/ai-gateway`): one OpenAI-compatible endpoint across
  providers with automatic **fallbacks, provider ordering, request logging
  (model, provider attempts, latency, tokens, cost), budgets/spend controls,
  BYOK, and zero markup on token prices**; usable from any environment
  (including locally) via API key, or OIDC on Vercel. A `ToolLoopAgent` can be
  pointed at Gateway models (docs show the `openai/gpt-6-astra`-style model
  string pattern). It solves "which model/credential is used" centrally and
  gives per-investigation cost attribution in request logs — exactly what an
  experiment lab needs.
  - Caveat for measurement integrity: model fallbacks can silently change the
    serving provider; read response metadata to record which provider actually
    served each step (docs explicitly document reading response metadata for
    this).

**Smallest viable Phase 1 orchestration stack (no new infra):**
Next.js API route / Workflow → **AI SDK `ToolLoopAgent`** (tool-calling loop,
step budget via `stopWhen`) → tools backed by **`@vercel/sandbox`** →
models via **AI Gateway** → loop state + artifacts persisted in **Supabase**
(Postgres + Storage, RLS-isolated). For runs that must survive longer than one
request lifecycle, promote the agent to **`WorkflowAgent` on Vercel Workflow**
instead of hand-rolling resumability.

---

## Appendix — UNVERIFIED items (not confirmed from docs read)

- Exact `firewall()` method name/shape on the Sandbox SDK (firewall page body
  beyond the intro was fetched but not fully excerpted; the "three modes"
  claim is verified, the update-at-runtime claim is verified).
- Snapshot-retention configuration details (`/docs/sandbox/concepts/snapshots`
  not read) and Drives API details (public beta per changelog; concepts page
  not read).
- Multi-agent Linux-user isolation details (`/docs/sandbox/concepts/multi-agent`
  not read) — relevant for multi-user PoC isolation inside one sandbox.
- Secure Compute configuration (not read; likely Enterprise-oriented).
- Fluid Compute function-duration limits for the orchestrator host (not
  researched; deliberately not quoted anywhere above).
- No prices/SKUs invented: every number above is quoted from
  `/docs/sandbox/pricing` (region `iad1` unless noted).
