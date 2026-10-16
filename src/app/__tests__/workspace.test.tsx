// @vitest-environment jsdom
/**
 * Smoke tests for the Research Workspace page.
 * Fetch is stubbed with MOCK fixtures shaped like the real API responses
 * (see `./fixtures.ts`) — no network, no store.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkspacePage from "../workspace/page";
import {
  fetchCalls,
  mockCreateProject,
  mockProjectsResponse,
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

beforeEach(() => {
  stubFetch({
    "/api/projects": { status: 200, body: mockProjectsResponse },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorkspacePage", () => {
  it("lists projects fetched from the real API shape", async () => {
    render(<WorkspacePage />);
    expect(await screen.findByText("Billing-service latency")).toBeTruthy();
    expect(screen.getByText(/why invoice rendering slows down/i)).toBeTruthy();
  });

  it("shows an honest empty state when there are no projects", async () => {
    stubFetch({ "/api/projects": { status: 200, body: { projects: [] } } });
    render(<WorkspacePage />);
    expect(await screen.findByText("No projects yet")).toBeTruthy();
  });

  it("shows an error with retry when the API fails", async () => {
    stubFetch({
      "/api/projects": { status: 500, body: { error: "boom" } },
    });
    render(<WorkspacePage />);
    expect(await screen.findByText("boom")).toBeTruthy();
  });

  it("creates a project through POST /api/projects and lists it", async () => {
    stubFetch({
      "/api/projects": { status: 200, body: mockProjectsResponse },
    });
    const { container } = render(<WorkspacePage />);
    await screen.findByText("Billing-service latency");

    /* Re-stub: the form POSTs; the mock answers with a created project. */
    const postCalls: Array<{ method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "POST") {
        postCalls.push({
          method: "POST",
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        });
        return new Response(JSON.stringify(mockCreateProject), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(mockProjectsResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Fresh project" },
    });
    fireEvent.change(screen.getByLabelText("Engineering objective"), {
      target: { value: "Learn how the lab handles a new objective." },
    });
    fireEvent.submit(
      container.querySelector(
        'form[aria-label="Create a research project"]',
      ) as HTMLElement,
    );

    await waitFor(() => {
      expect(postCalls).toHaveLength(1);
    });
    const sent = postCalls[0].body as Record<string, unknown>;
    expect(sent.name).toBe("Fresh project");
    expect(sent.constraints).toEqual([]);
    /* The created project appears at the top of the list. */
    expect(await screen.findByText("Fresh project")).toBeTruthy();
    expect(fetchCalls).toBeDefined();
  });
});
