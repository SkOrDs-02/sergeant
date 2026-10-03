/** @vitest-environment jsdom */
/**
 * Colocated shell smoke for `ShellDeepLinkBridge`. Full BroadcastChannel /
 * queue behaviour is covered in `test/integration/shell-deeplink.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import {
  SHELL_DEEPLINK_BRIDGE_READY_KEY,
  SHELL_DEEPLINK_CHANNEL,
  SHELL_DEEPLINK_QUEUE_KEY,
} from "@sergeant/shared";

const { isCapacitorMock } = vi.hoisted(() => ({
  isCapacitorMock: vi.fn(() => false),
}));

vi.mock("@sergeant/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sergeant/shared")>();
  return { ...actual, isCapacitor: isCapacitorMock };
});

import { ShellDeepLinkBridge } from "./ShellDeepLinkBridge";

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="loc">{location.pathname}</span>;
}

function renderBridge(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ShellDeepLinkBridge />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ShellDeepLinkBridge — browser shell", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is a no-op in the browser and leaves navigation unchanged", () => {
    const { getByTestId } = renderBridge();
    expect(getByTestId("loc").textContent).toBe("/");
  });
});

describe("ShellDeepLinkBridge — Capacitor install", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(true);
    delete (
      window as Window & {
        [SHELL_DEEPLINK_BRIDGE_READY_KEY]?: unknown;
        [SHELL_DEEPLINK_QUEUE_KEY]?: unknown;
      }
    )[SHELL_DEEPLINK_BRIDGE_READY_KEY];
    delete (window as Window & { [SHELL_DEEPLINK_QUEUE_KEY]?: unknown })[
      SHELL_DEEPLINK_QUEUE_KEY
    ];
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    vi.restoreAllMocks();
  });

  it("sets bridge-ready flag on window after mount", () => {
    renderBridge();
    expect(
      (window as Window & { [SHELL_DEEPLINK_BRIDGE_READY_KEY]?: boolean })[
        SHELL_DEEPLINK_BRIDGE_READY_KEY
      ],
    ).toBe(true);
  });

  it("navigates to a whitelisted path via BroadcastChannel", async () => {
    const { getByTestId } = renderBridge();
    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "/finyk/budgets",
      source: "shell",
      timestamp: Date.now(),
    });
    await waitFor(() =>
      expect(getByTestId("loc").textContent).toBe("/finyk/budgets"),
    );
    sender.close();
  });

  it("rejects unsafe paths without navigating", async () => {
    const { getByTestId } = renderBridge();
    const sender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    sender.postMessage({
      protocolVersion: 1,
      url: "javascript:alert(1)",
      source: "shell",
      timestamp: Date.now(),
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(getByTestId("loc").textContent).toBe("/");
    sender.close();
  });

  it("drains the cold-start queue on mount", async () => {
    (window as Window & { [SHELL_DEEPLINK_QUEUE_KEY]?: string[] })[
      SHELL_DEEPLINK_QUEUE_KEY
    ] = ["/welcome"];
    const { getByTestId } = renderBridge();
    await waitFor(() =>
      expect(getByTestId("loc").textContent).toBe("/welcome"),
    );
  });
});
