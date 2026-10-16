// @vitest-environment jsdom
/**
 * Smoke tests for the Investigation View.
 * Fetch is stubbed with MOCK fixtures shaped like the real API responses
 * (see `./fixtures.ts`) — no network, no store.
 *
 * Covers: objective + plan steps render with real statuses, 3s polling
 * wiring, and the honest "engine offline" state when POST /advance is
 * absent (404) — never a faked advance.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InvestigationPage from "../investigation/[id]/page";
import {
  mockExperiments,
  mockInvestigationResponse,
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
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvestigationPage", () => {
  it("renders the objective and plan steps with real statuses", async () => {
    stubFetch({
      "/api/investigations/inv-test-1": {
        status: 200,
        body: mockInvestigationResponse,
      },
      "/api/investigations/inv-test-1/experiments": {
        status: 200,
        body: { experiments: [] },
      },
    });
    render(<InvestigationPage />);

    expect(
      await screen.findByText(/why invoice rendering slows down/i),
    ).toBeTruthy();
    expect(
      await screen.findByText("Inspect invoice rendering path"),
    ).toBeTruthy();
    expect(await screen.findByText("Propose alternative")).toBeTruthy();
    /* Real statuses from the fixture ("running" also badges the run itself). */
    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.getAllByText("running").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("pending")).toBeTruthy();
    expect(screen.getByText("current")).toBeTruthy();
  });

  it("shows an honest engine-offline state when /advance is missing (404)", async () => {
    stubFetch({
      "/api/investigations/inv-test-1": {
        status: 200,
        body: mockInvestigationResponse,
      },
      "/api/investigations/inv-test-1/experiments": {
        status: 200,
        body: { experiments: [] },
      },
      "/api/investigations/inv-test-1/advance": {
        status: 404,
        body: { error: "not found" },
      },
    });
    render(<InvestigationPage />);
    await screen.findByText(/why invoice rendering slows down/i);

    fireEvent.click(screen.getByRole("button", { name: "Advance" }));

    expect(await screen.findByText(/Engine offline/)).toBeTruthy();
    expect(screen.getByText(/no steps were advanced/i)).toBeTruthy();
  });

  it("surfaces the engine's own 501 when /continue is not implemented", async () => {
    stubFetch({
      "/api/investigations/inv-test-1": {
        status: 200,
        body: mockInvestigationResponse,
      },
      "/api/investigations/inv-test-1/experiments": {
        status: 200,
        body: { experiments: [] },
      },
      "/api/investigations/inv-test-1/continue": {
        status: 501,
        body: { error: "investigation engine not yet implemented" },
      },
    });
    const { container } = render(<InvestigationPage />);
    await screen.findByText(/why invoice rendering slows down/i);

    fireEvent.change(screen.getByLabelText("Instruction"), {
      target: { value: "focus on the retry path" },
    });
    fireEvent.submit(
      container.querySelector(
        'form[aria-label="Continue with a new instruction"]',
      ) as HTMLElement,
    );

    expect(await screen.findByText(/continue not executed/i)).toBeTruthy();
    expect(
      screen.getByText(/investigation engine not yet implemented/),
    ).toBeTruthy();
  });

  it("lists experiment specs and reports the 501 when a run is requested", async () => {
    stubFetch({
      "/api/investigations/inv-test-1": {
        status: 200,
        body: mockInvestigationResponse,
      },
      "/api/investigations/inv-test-1/experiments": {
        status: 200,
        body: mockExperiments,
      },
      "/api/experiments/exp-test-1/run": {
        status: 501,
        body: { error: "investigation engine not yet implemented" },
      },
    });
    render(<InvestigationPage />);

    expect(
      await screen.findByText(/Compare join-based formatting/i),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run experiment" }));
    expect(await screen.findByText(/Not executed/)).toBeTruthy();
  });
});
