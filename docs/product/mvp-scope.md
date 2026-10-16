# MVP Scope — Reverse Lab

## In scope

- Research projects with natural-language objectives and multiple target types.
- Autonomous investigation over a real software target (plan → execute → revise → structured result).
- At least one **verified** reverse-engineering capability invoked end to end (see `docs/research/rea-capability-matrix.md`).
- Structured evidence linked to findings; conclusions traceable to evidence.
- Experiment specs, alternative-implementation artifacts, isolated test execution, real measurements, honest comparisons.
- Persistent investigation state (leave and return; continue with new instructions).
- The three views (Research Workspace, Investigation View, Knowledge Space) at the minimum fidelity needed to complete one real investigation.
- A minimal landing page.
- MCP server exposing investigation operations to external agents.
- Learning-oriented explanations grounded in actual investigation results.

## Out of scope for the MVP

- GPU-intensive model training, fine-tuning, or model benchmarks.
- LangGraph or any agent framework beyond Vercel AI SDK (unless a demonstrated requirement justifies it).
- Native binary analysis as a mandatory dependency (evaluate; include only if the infra cost is justified).
- Public extension/plugin SDK or marketplace.
- Billing, Research Credits accounting, Polar, Resend (documented in `docs/commercial/`, not implemented).
- Advanced learning features: auto-generated curricula, interactive courses, knowledge graphs.
- Every possible visualization — build only what one complete investigation needs.

## MVP acceptance criteria

All 15 must hold for a real investigation, end to end:

- [ ] 1. Create a Research Project.
- [ ] 2. Define an engineering objective.
- [ ] 3. Start an autonomous investigation.
- [ ] 4. Inspect a supported software target.
- [ ] 5. Use at least one verified reverse engineering capability.
- [ ] 6. Produce findings linked to relevant evidence.
- [ ] 7. Identify a meaningful implementation opportunity.
- [ ] 8. Define an appropriate experiment.
- [ ] 9. Generate an alternative implementation when the objective requires it.
- [ ] 10. Execute compatible tests in an isolated environment.
- [ ] 11. Compare the results using real observations or measurements.
- [ ] 12. Explain the findings and limitations.
- [ ] 13. Continue the investigation with a new instruction.
- [ ] 14. Retrieve previous results after returning to the project.
- [ ] 15. Access useful investigation functionality through MCP.

Notes:

- Not every investigation must generate alternative code or run a benchmark. The system selects the operations appropriate to the objective; the criteria describe what the complete workflow *can* do, not what every run *must* do.
- The MVP is not complete when the UI renders. It is complete when a user finishes a real investigation and every conclusion is traceable to evidence or measurements.
- Failed experiments, unavailable tools, and inconclusive results are part of the MVP — they must be visible and explicit, never converted into apparent successes.
