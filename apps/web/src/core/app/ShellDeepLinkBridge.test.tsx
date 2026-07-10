/** @vitest-environment jsdom */
/**
 * Colocated shell smoke for `ShellDeepLinkBridge`. Full BroadcastChannel /
 * coalescing behaviour is covered in `test/integration/shell-deeplink.test.tsx`;
 * here we pin the browser no-op contract and unsafe-path rejection at the
 * component boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

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
    delete (window as Window & { __sergeantShellNavigate?: unknown })
      .__sergeantShellNavigate;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is a no-op in the browser and leaves navigation unchanged", () => {
    const { getByTestId } = renderBridge();
    expect(getByTestId("loc").textContent).toBe("/");
    expect(
      (window as Window & { __sergeantShellNavigate?: unknown })
        .__sergeantShellNavigate,
    ).toBeUndefined();
  });
});

describe("ShellDeepLinkBridge — Capacitor install", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(true);
    delete (
      window as Window & {
        __sergeantShellNavigate?: unknown;
        __sergeantShellDeepLinkQueue?: unknown;
      }
    ).__sergeantShellNavigate;
    delete (window as Window & { __sergeantShellDeepLinkQueue?: unknown })
      .__sergeantShellDeepLinkQueue;
  });

  afterEach(async () => {
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    vi.restoreAllMocks();
  });

  it("exposes the backward-compat navigate shim on window", () => {
    renderBridge();
    expect(
      typeof (
        window as Window & { __sergeantShellNavigate?: (p: string) => void }
      ).__sergeantShellNavigate,
    ).toBe("function");
  });

  it("navigates to a whitelisted path via the window shim", async () => {
    const { getByTestId } = renderBridge();
    const nav = (
      window as Window & { __sergeantShellNavigate?: (p: string) => void }
    ).__sergeantShellNavigate;
    act(() => {
      nav?.("/finyk/budgets");
    });
    await waitFor(() =>
      expect(getByTestId("loc").textContent).toBe("/finyk/budgets"),
    );
  });

  it("rejects unsafe paths without navigating", async () => {
    const { getByTestId } = renderBridge();
    const nav = (
      window as Window & { __sergeantShellNavigate?: (p: string) => void }
    ).__sergeantShellNavigate;
    act(() => {
      nav?.("javascript:alert(1)");
      nav?.("//evil.example");
    });
    expect(getByTestId("loc").textContent).toBe("/");
  });

  it("drains the cold-start queue on mount", async () => {
    (
      window as Window & { __sergeantShellDeepLinkQueue?: string[] }
    ).__sergeantShellDeepLinkQueue = ["/welcome"];
    const { getByTestId } = renderBridge();
    await waitFor(() =>
      expect(getByTestId("loc").textContent).toBe("/welcome"),
    );
  });
});
