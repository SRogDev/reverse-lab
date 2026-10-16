# REA fixtures

Real outputs from `rea-agents@6.5.0`, captured 2026-10-16. Used by
`../rea.test.ts` so the parser is tested against the CLI's actual shape,
not an invented one.

- `rea-analyze-javascript-application.json` — stdout of
  `rea analyze-javascript-application /tmp/rea-probe-app --json`
  (exit 0) over a 2-file CommonJS probe app. The bulky
  `normalized_result.graph` and `normalized_result.semantic_graph`
  payloads are **trimmed** (first 2 nodes/relations kept, counts and ids
  preserved, `_trimmed: true` marker added). Everything else —
  `evidence_id`, `provider`, `limitations[]`, `subject`, `operation`,
  `predicate_type`, `summary`, `statistics` — is verbatim.
- `rea-error-invalid-input.json` — stdout of
  `rea analyze-javascript-application /tmp/does-not-exist-xyz --json`
  (exit 1). Verbatim.

Shape note (verified against the real CLI): the CLI `--json` output is a
**flat** evidence record at the top level. The `content[]` /
`structuredContent` envelope described in `docs/research/rea-integration.md`
§2 is the **MCP** `CallToolResult` shape; the CLI flattens it. The parser in
`../rea.ts` codes against the real CLI shape.
