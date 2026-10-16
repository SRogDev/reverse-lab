// @vitest-environment jsdom
/**
 * Smoke tests for the shared UI atoms. Fixtures here are MOCK evidence
 * shaped like `src/types.ts#Evidence` — not real lab records.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Evidence } from "@/types";
import { EvidenceCard, StatusBadge, VerificationBadge } from "../ui";

const mockEvidence: Evidence = {
  id: `lab-ev-${"b".repeat(64)}`,
  type: "observation",
  source: "test-harness",
  observation: "The mock observation.",
  limitations: ["Mock limitation one.", "Mock limitation two."],
  verification: "hypothesis",
  provenance: {},
  createdAt: "2026-10-16T00:00:00.000Z",
};

describe("StatusBadge", () => {
  it("renders the run status text", () => {
    render(<StatusBadge status="needs-evaluation" />);
    expect(screen.getByText("needs-evaluation")).toBeTruthy();
  });
});

describe("VerificationBadge", () => {
  it("renders the verification label", () => {
    render(<VerificationBadge verification="third-party" />);
    expect(screen.getByText("third-party")).toBeTruthy();
  });
});

describe("EvidenceCard", () => {
  it("renders observation, mono evidence id, source, and verbatim limitations", () => {
    render(<EvidenceCard evidence={mockEvidence} />);
    expect(screen.getByText("The mock observation.")).toBeTruthy();
    expect(screen.getByText(/^lab-ev-bbbb/)).toBeTruthy();
    expect(screen.getByText("test-harness")).toBeTruthy();
    expect(screen.getByText("Mock limitation one.")).toBeTruthy();
    expect(screen.getByText("Mock limitation two.")).toBeTruthy();
    expect(screen.getByText("hypothesis")).toBeTruthy();
  });

  it("says so when no limitations were recorded", () => {
    render(<EvidenceCard evidence={{ ...mockEvidence, limitations: [] }} />);
    expect(screen.getByText("No limitations recorded.")).toBeTruthy();
  });
});
