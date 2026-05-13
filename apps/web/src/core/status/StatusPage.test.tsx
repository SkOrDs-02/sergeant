// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import StatusPage from "./StatusPage";
import type { StatusResponse } from "./types";

/**
 * UI tests for `/status` (PR-41).
 *
 * Covers the three rendered branches: loading, success (operational /
 * one-degraded / one-down compound paint), and fetch-error → retry.
 * Each variant pins the data-testid markers consumed by Playwright
 * smokes so the page contract stays stable.
 */

function buildResponse(
  overrides: Partial<StatusResponse> = {},
): StatusResponse {
  return {
    status: "operational",
    timestamp: new Date("2026-05-13T12:00:00.000Z").toISOString(),
    components: [
      { id: "server", label: "API server", status: "operational" },
      { id: "database", label: "Database", status: "operational" },
      { id: "n8n", label: "n8n workflows", status: "operational" },
      { id: "console-bot", label: "OpenClaw bot", status: "operational" },
    ],
    lastIncident: null,
    ...overrides,
  };
}

function mockFetchOk(body: StatusResponse): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    })) as unknown as typeof fetch,
  );
}

function mockFetchHttpError(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status,
      json: async () => ({}),
    })) as unknown as typeof fetch,
  );
}

function mockFetchNetworkError(message: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error(message);
    }) as unknown as typeof fetch,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-05-13T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("StatusPage", () => {
  it("renders loading state immediately on mount", () => {
    mockFetchOk(buildResponse());
    render(<StatusPage />);
    expect(screen.getByTestId("status-loading")).toBeTruthy();
  });

  it("renders all-operational view when every component is healthy", async () => {
    mockFetchOk(buildResponse());
    render(<StatusPage />);
    await waitFor(() =>
      expect(screen.getByTestId("status-ready")).toBeTruthy(),
    );
    const overall = screen.getByTestId("status-overall");
    expect(overall.textContent).toContain("Усі сервіси працюють");
    for (const id of ["server", "database", "n8n", "console-bot"] as const) {
      const row = screen.getByTestId(`status-row-${id}`);
      expect(row.getAttribute("data-status")).toBe("operational");
    }
    const lastIncident = screen.getByTestId("status-last-incident");
    expect(lastIncident.textContent).toContain("не зафіксовано");
  });

  it("paints overall degraded when one component is degraded", async () => {
    mockFetchOk(
      buildResponse({
        status: "degraded",
        components: [
          { id: "server", label: "API server", status: "operational" },
          { id: "database", label: "Database", status: "operational" },
          { id: "n8n", label: "n8n workflows", status: "degraded" },
          { id: "console-bot", label: "OpenClaw bot", status: "operational" },
        ],
        lastIncident: {
          at: new Date("2026-05-13T11:50:00.000Z").toISOString(),
          component: "n8n",
        },
      }),
    );
    render(<StatusPage />);
    await waitFor(() =>
      expect(screen.getByTestId("status-ready")).toBeTruthy(),
    );
    const overall = screen.getByTestId("status-overall");
    expect(overall.textContent).toContain("Часткова деградація");
    const n8nRow = screen.getByTestId("status-row-n8n");
    expect(n8nRow.getAttribute("data-status")).toBe("degraded");
    const lastIncident = screen.getByTestId("status-last-incident");
    expect(lastIncident.textContent).toContain("n8n workflows");
  });

  it("paints overall down when at least one component is down", async () => {
    mockFetchOk(
      buildResponse({
        status: "down",
        components: [
          { id: "server", label: "API server", status: "operational" },
          { id: "database", label: "Database", status: "down" },
          { id: "n8n", label: "n8n workflows", status: "operational" },
          { id: "console-bot", label: "OpenClaw bot", status: "degraded" },
        ],
      }),
    );
    render(<StatusPage />);
    await waitFor(() =>
      expect(screen.getByTestId("status-ready")).toBeTruthy(),
    );
    const overall = screen.getByTestId("status-overall");
    expect(overall.textContent).toContain("Серйозна проблема");
    expect(
      screen.getByTestId("status-row-database").getAttribute("data-status"),
    ).toBe("down");
    expect(
      screen.getByTestId("status-row-console-bot").getAttribute("data-status"),
    ).toBe("degraded");
  });

  it("renders an error card with retry when fetch returns non-2xx", async () => {
    mockFetchHttpError(503);
    render(<StatusPage />);
    await waitFor(() =>
      expect(screen.getByTestId("status-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("status-error").textContent).toContain("503");
    expect(screen.getByRole("button", { name: /Спробувати ще/ })).toBeTruthy();
  });

  it("renders an error card when fetch throws (network down)", async () => {
    mockFetchNetworkError("Failed to fetch");
    render(<StatusPage />);
    await waitFor(() =>
      expect(screen.getByTestId("status-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("status-error").textContent).toContain(
      "Failed to fetch",
    );
  });

  it("retries on button click after an error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => buildResponse(),
      });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<StatusPage />);
    await waitFor(() =>
      expect(screen.getByTestId("status-error")).toBeTruthy(),
    );

    const retry = screen.getByRole("button", { name: /Спробувати ще/ });
    await act(async () => {
      retry.click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("status-ready")).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
