# Future Commercial Requirements — Reverse Lab

**Status: Phase 8 checklist. None of this is built in the MVP.**

When commercialization starts, the following must exist — in this dependency order:

## 1. Usage accounting pipeline

- Every billable operation emits a usage record (operation type, investigation, measured consumption: model calls, execution resources, third-party ops).
- Records are immutable and attributable to a user/project. This is the authoritative ledger; payment-provider events are not.

## 2. Credit ledger

- Research Credit balances per customer, with a full transaction history (grants, consumption, adjustments).
- Configurable, versioned pricing policy mapping consumption → credits.

## 3. Polar integration

- Subscriptions and one-time credit purchases via Polar.
- Idempotent webhook processing: retried/duplicated events never double-grant or double-charge.
- Application-level limits enforced from our own ledger, independent of provider event timing.

## 4. Plans and limits

- Pro / Scale / Enterprise tiers with credit allotments, concurrency limits, and feature gates.
- Graceful behavior at limits: investigations pause with a clear state, never corrupt or silently drop work.

## 5. Notifications (Resend)

- Investigation completion/failure, long-running job updates, usage threshold alerts, billing events.
- Only what a demonstrated need justifies.

## 6. Operational controls

- Cost dashboards (internal), abuse detection, support tooling for credit adjustments.
- Audit trail for all billing-relevant actions.

## Non-requirements

- No enforcement, paywalls, or payment UI in the MVP.
- No prices or credit costs are assigned before measured consumption exists (see `pricing-model.md`).
