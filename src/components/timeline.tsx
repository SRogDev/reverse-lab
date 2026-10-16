/**
 * Plan-step timeline — one of the two relationship visualizations the lab
 * ships (the other is the evidence→finding linkage in the knowledge space).
 * Renders only what the API returned: real step statuses, no filler.
 */

import type { PlanStep } from "@/types";
import { EmptyState, StatusBadge } from "./ui";

export function PlanTimeline({
  plan,
  currentStep,
}: {
  plan: PlanStep[];
  currentStep?: string;
}) {
  if (plan.length === 0) {
    return (
      <EmptyState title="No plan steps yet">
        The engine has not published a plan for this investigation.
      </EmptyState>
    );
  }
  return (
    <ol className="timeline">
      {plan.map((step) => (
        <li key={step.id} data-status={step.status}>
          <span className="timeline-dot" aria-hidden="true" />
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <strong className="mono small">{step.title}</strong>
            <StatusBadge status={step.status} />
            {currentStep === step.id ? (
              <span className="badge badge-run-green">current</span>
            ) : null}
          </div>
          {step.detail ? (
            <p className="small muted" style={{ margin: "0.25rem 0 0" }}>
              {step.detail}
            </p>
          ) : null}
          <p className="mono-id" style={{ margin: "0.25rem 0 0" }}>
            {step.id}
          </p>
        </li>
      ))}
    </ol>
  );
}
