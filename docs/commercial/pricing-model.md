# Pricing Model — Reverse Lab

**Status: documented principles only. No prices are defined. Pricing follows measurement, and measurement starts in Phase 1.**

## Principles

1. **Value unit, not cost unit.** Customers see Research Credits (research capacity). Internally, every operation records its real consumption: model calls (via AI Gateway accounting), execution resources (sandbox time/compute), and third-party operations.
2. **Conversion is configurable.** A pricing policy maps measured consumption to credits. The policy is versioned and auditable — credit costs can be explained, not just asserted.
3. **No arbitrary prices.** Credit costs per operation category are assigned only after real consumption is measured across representative investigations. Estimates used internally are labeled as estimates.
4. **Costs are tracked before they are charged.** The usage-accounting pipeline (Phase 8) exists before any customer pays, so the first prices rest on data.

## What must be measured (Phase 1 → Phase 7)

- Tokens and model calls per investigation type (via AI Gateway).
- Isolated execution time/compute per experiment type.
- Third-party operation counts (RE tools, research fetches).
- Distribution of investigation lengths: quick inspections vs deep multi-iteration runs.
- Failure/retry overhead (failed operations still cost — the model must account for them honestly).

## What is deliberately absent

- Final prices, per-plan credit allotments, overage rates.
- Internal cost structures and margins (not for the public repo — see `monetization-strategy.md` boundary note).

These are defined in Phase 8, from the measurements above.
