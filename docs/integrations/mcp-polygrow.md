# Integrating Polygrow with Reverse Lab over MCP

Status: the MCP server speaks **stdio** today (`npm run mcp:server`).
Polygrow integrates by spawning it as a child process of a Polygrow worker
(same-machine trust model — see `docs/architecture/mcp-auth.md` §1) and
driving the 7 tools with any MCP client. No Polygrow-specific server changes
are needed: the tools are the API.

## The flow

Four operations cover the whole loop; each tool call is independent (no
long-lived session).

### 1. Start an investigation

```
create_research_project  { name, objective, constraints? } → { project }
start_investigation      { projectId, objective? }         → { run }
```

`start_investigation` creates the run record and returns it with
`status: "pending"`. The objective defaults to the project's objective when
omitted. (Until the Phase 3 engine lands, runs stay `pending` — the run
record is real; autonomous execution is not. See the `// REWIRE` markers in
`src/mcp/tools.ts`.)

### 2. Poll status

```
get_investigation_status { investigationId } → { run }   # status, currentStep, plan
```

Poll on whatever cadence fits Polygrow's agent loop. The `plan` array shows
each step's `title` and `status` (`pending`/`running`/`completed`/…).

### 3. Fetch results

```
get_investigation_results { investigationId } → { run, findings, evidence, hypotheses, conclusions }
list_research_findings    { investigationId, status? }   → { findings }
get_experiment_results    { experimentId }                → { experiment, runs }
```

Every claim carries `evidence_ids` and `limitations` — findings and
hypotheses resolve their linked evidence's limitations at read time, so a
Polygrow agent can quote the caveat next to the claim instead of
discovering it later. `get_experiment_results` returns the spec plus all
recorded runs (`rawValues`, `failures`, `environment`).

### 4. Continue

```
continue_investigation { investigationId, instruction } → { run }
```

Appends the instruction as a pending plan step and marks the run
`running`. Today this is the Store-level version (record the step; the
engine executes it when it lands). Polygrow's agent uses this to steer:
"also probe the read path", "re-run with more repetitions", etc.

## Real example transcript

Pasted verbatim from `npm run mcp:smoke` (2026-10-16), which drives all 7
tools over stdio with the real SDK client against a fresh tmpdir FileStore.
Ids are truncated; they differ on every run. Nothing here is invented.

```
== Reverse Lab MCP smoke ==
data dir: /tmp/rl-mcp-smoke-Gi0amf
server exposes 7 tools: create_research_project, start_investigation, get_investigation_status, get_investigation_results, list_research_findings, get_experiment_results, continue_investigation
[1/7] create_research_project → project "smoke-demo" created (id 480f17e9…)
[2/7] start_investigation → run 8e31bc6d… status=pending objective="verify the MCP tool chain end to end"
[3/7] get_investigation_status → status=pending, plan steps=0
-- seeded 1 evidence + 1 finding via Store (no tool covers creation yet)
[4/7] get_investigation_results → findings=1 evidence=1 hypotheses=0 conclusions=0 first finding: evidence_ids=["lab-ev-e5ddc6fb0b0512eec9e5d0417fa1f1204e90d6bd243d797e77d8b6f82374a8ff"] limitations=["seeded by the smoke script itself"]
[5/7] list_research_findings → findings=1
-- seeded experiment 336b8f3d… via Store (no tool covers creation yet)
[6/7] get_experiment_results → experiment "measure smoke latency" runs=1
[7/7] continue_investigation → status=running last step="extend the smoke probe to the evidence pipeline" (pending)
[8/7] get_investigation_status (unknown id) → isError, as expected
== smoke OK ==
```

Notes for the Polygrow side:

- The `-- seeded … via Store` lines are the smoke script being honest: no
  tool creates evidence/findings/experiments yet (out of the 7-tool scope),
  so the smoke seeds them through the same `Store` interface the tools
  use. In production, evidence arrives from REA and the engine, not from
  MCP writes.
- `[8/7]` shows the error contract: an unknown id returns an MCP `isError`
  result, never a protocol crash.
- Structured outputs are validated by the SDK against each tool's zod
  `outputSchema` (`structuredContent`), and a JSON `text` block is included
  for clients that prefer it.

## Checklist for a Polygrow worker

1. Spawn `npm run mcp:server` (or `node src/mcp/server.ts`) with
   `REVERSE_LAB_DATA_DIR` pointing at the workspace's data directory.
2. Connect with any MCP client over stdio (`StdioClientTransport`).
3. `tools/list` to confirm the 7 tools, then run the flow above.
4. Store the returned `project.id` / `investigationId` in Polygrow's own
   records; all later calls key off them.
5. When the HTTP transport lands (auth design in
   `docs/architecture/mcp-auth.md`), swap the transport — the tool
   names, inputs, and outputs stay the same.
