# Monetization Strategy — Reverse Lab

**Status: strategy documented only. Nothing is implemented. All of this is Phase 8.**

> Boundary note (2026-10-16): this is a public repository. Internal cost structures, margins, and pricing internals are intentionally **not** documented here. What follows is the public-facing strategy: the usage model, plan shapes, and integration choices.

## Research Credits

The customer-facing usage unit is **Research Credits**, not raw AI tokens. Customers buy research capacity; Reverse Lab internally tracks actual consumption (model calls, execution resources, third-party operations) and converts it into credits through a configurable pricing policy.

Principles:

- Credits map to legible research work (an investigation, a benchmark study), not to token counts.
- Internal cost tracking is authoritative and independent of the payment provider.
- Credit costs per operation are set from **measured** consumption and value — never assigned arbitrarily before real usage exists.

## Operation categories (conceptual)

- **Quick Inspection** — bounded, single-target analysis.
- **Deep Investigation** — multi-target, iterative, with experiments.
- **Comparative Research** — multiple implementations compared.
- **Benchmark Study** — measurement-heavy evaluation work.

These are examples. Actual credit costs follow validated operational costs.

## Plans (future)

- **Pro** — individual developers doing regular investigations.
- **Scale** — heavier usage, more concurrent investigations, larger workloads.
- **Enterprise** — capacity, admin controls, integrations, operational guarantees.

No final prices are defined here. Prices follow measured execution costs and usage patterns (see `pricing-model.md`).

## Polar (future integration)

Polar handles payments and subscriptions. Reverse Lab keeps its own authoritative usage accounting and enforces application-level limits independently of payment-provider events. Billing integration is designed around reliable usage records and idempotent payment-event processing — a duplicated or delayed webhook must never double-charge or double-grant.

## Resend (future integration)

Notifications: investigation completion/failure, long-running job updates, usage alerts, billing-related messages. Introduced only when a demonstrated need emerges — not in the MVP.
