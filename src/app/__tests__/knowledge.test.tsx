// @vitest-environment jsdom
/**
 * Smoke tests for the Knowledge Space.
 * Fetch is stubbed with MOCK fixtures shaped like the real API responses
 * (see `./fixtures.ts`) — no network, no store.
 *
 * Covers: findings linked to evidence, evidence cards with verbatim
 * limitations + mono evidence ids, hypotheses visibly labeled, conclusions
 * with limitations, and honest empty states.
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KnowledgePage from "../knowledge/[id]/page";
import {
  mockExperiments,
  mockInvestigationResponse,
  mockResults,
  stubFetch,
} from "./fixtures";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "inv-test-1" }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFull() {
  stubFetch({
    "/api/investigations/inv-test-1": {
      status: 200,
      body: mockInvestigationResponse,
    },
    "/api/investigations/inv-test-1/results": {
      status: 200,
      body: mockResults,
    },
    "/api/investigations/inv-test-1/experiments": {
      status: 200,
      body: mockExperiments,
    },
  });
}

describe("KnowledgePage", () => {
  it("renders findings linked to their evidence", async () => {
    stubFull();
    render(<KnowledgePage />);

    expect(
      await screen.findByText("Line-item formatting dominates render cost"),
    ).toBeTruthy();
    /* The finding card embeds its evidence card, so the observation appears
       in both the findings and the evidence sections. */
    expect(
      screen.getAllByText(/spends 78% of wall time in formatLineItems/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("shows evidence with verification badge, mono id, and verbatim limitations", async () => {
    stubFull();
    render(<KnowledgePage />);
    /* Section heading + the finding's "Evidence (n)" label. */
    expect(
      (await screen.findAllByText("Evidence (1)")).length,
    ).toBeGreaterThanOrEqual(2);

    expect(screen.getAllByText("measured").length).toBeGreaterThan(0);
    /* The id appears in the finding's embedded evidence card and in the
       standalone evidence section. */
    expect(screen.getAllByText(/^lab-ev-aaaa/).length).toBeGreaterThanOrEqual(
      2,
    );
    /* Limitations render verbatim from the fixture (embedded + standalone). */
    expect(
      screen.getAllByText(/Sampled on a single machine/i).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(/Profiler overhead estimated/i).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("labels hypotheses as hypotheses, never as facts", async () => {
    stubFull();
    render(<KnowledgePage />);
    /* Section heading + the learning summary's "Hypotheses (n)" label. */
    expect(
      (await screen.findAllByText("Hypotheses (1)")).length,
    ).toBeGreaterThanOrEqual(2);

    expect(screen.getByText(/hypothesis · testing/i)).toBeTruthy();
    expect(screen.getByText(/Replacing string concatenation/i)).toBeTruthy();
  });

  it("renders conclusions with their limitations", async () => {
    stubFull();
    render(<KnowledgePage />);
    await screen.findByText("Conclusions (1)");

    expect(screen.getByText(/quadratic formatting/i)).toBeTruthy();
    expect(
      screen.getByText(/Only validated on synthetic 500-line invoices/i),
    ).toBeTruthy();
  });

  it("shows honest empty states when nothing is recorded", async () => {
    stubFetch({
      "/api/investigations/inv-test-1": {
        status: 200,
        body: mockInvestigationResponse,
      },
      "/api/investigations/inv-test-1/results": {
        status: 200,
        body: { findings: [], evidence: [], hypotheses: [], conclusions: [] },
      },
      "/api/investigations/inv-test-1/experiments": {
        status: 200,
        body: { experiments: [] },
      },
    });
    render(<KnowledgePage />);

    expect(await screen.findByText("No evidence yet")).toBeTruthy();
    expect(screen.getByText("No findings yet")).toBeTruthy();
    expect(screen.getByText("No hypotheses yet")).toBeTruthy();
    expect(screen.getByText("No conclusions yet")).toBeTruthy();
  });

  it("flags a finding whose linked evidence id has no record", async () => {
    stubFetch({
      "/api/investigations/inv-test-1": {
        status: 200,
        body: mockInvestigationResponse,
      },
      "/api/investigations/inv-test-1/results": {
        status: 200,
        body: {
          ...mockResults,
          evidence: [] /* evidence record missing */,
        },
      },
      "/api/investigations/inv-test-1/experiments": {
        status: 200,
        body: { experiments: [] },
      },
    });
    render(<KnowledgePage />);

    expect(
      await screen.findByText(/Linked evidence id not found/i),
    ).toBeTruthy();
  });
});
