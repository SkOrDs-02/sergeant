// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

/**
 * Cold-boot redirect-race regression guard (symptom #1 — "onboarding completion
 * doesn't stick"). On a hard reload the SQLite warm-cache backing
 * `shouldShowOnboarding()` is still booting; HubPage must render a splash and
 * defer the onboarding decision until storage is ready — never bounce a
 * returning user to `/welcome` against the empty pre-boot store.
 *
 * The hub composition (`HubHomeView`) and the standalone-route registry are
 * stubbed so this exercises only HubPage's guard ladder.
 */

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const real =
    await vi.importActual<typeof import("react-router-dom")>(
      "react-router-dom",
    );
  return { ...real, useNavigate: () => mockNavigate };
});

const mockShouldShowOnboarding = vi.fn<() => boolean>(() => false);
vi.mock("../onboarding/onboardingGate", () => ({
  shouldShowOnboarding: () => mockShouldShowOnboarding(),
  isDemoActive: () => false,
}));

const { mockRenderStandaloneRoute } = vi.hoisted(() => ({
  mockRenderStandaloneRoute: vi.fn<(args: unknown) => ReactNode>(() => null),
}));
vi.mock("./StandaloneRoutes", () => ({
  renderStandaloneRoute: (args: unknown) => mockRenderStandaloneRoute(args),
}));

vi.mock("./HubHomeView", () => ({
  HubHomeView: () => <div data-testid="hub-home">hub</div>,
}));

const mockShell: { activeModule: string | null } = { activeModule: null };
vi.mock("./HubShellContext", () => ({
  useHubShell: () => mockShell,
}));

import { HubPage } from "./HubPage";
import {
  __resetStorageReadyForTests,
  markStorageBooting,
  markStorageReady,
} from "../db/storageReady";

function renderHubAtEntry(entry = "/") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <HubPage />
    </MemoryRouter>,
  );
}

function renderHubAtRoot() {
  return renderHubAtEntry("/");
}

describe("<HubPage /> — onboarding-redirect cold-boot gate", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockShouldShowOnboarding.mockClear();
    mockShouldShowOnboarding.mockReturnValue(false);
    mockRenderStandaloneRoute.mockClear();
    mockRenderStandaloneRoute.mockReturnValue(null);
    mockShell.activeModule = null;
    __resetStorageReadyForTests();
  });
  afterEach(() => {
    __resetStorageReadyForTests();
  });

  it("renders a splash and does NOT redirect while the persistent store is booting", () => {
    markStorageBooting();
    renderHubAtRoot();

    // Splash — neither the hub home nor a /welcome redirect.
    expect(screen.queryByTestId("hub-home")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
    // The side-effecting onboarding gate must not be consulted pre-boot.
    expect(mockShouldShowOnboarding).not.toHaveBeenCalled();
  });

  it("redirects a first-time visitor to /welcome only once storage is ready", () => {
    markStorageBooting();
    renderHubAtRoot();
    expect(mockNavigate).not.toHaveBeenCalled();

    mockShouldShowOnboarding.mockReturnValue(true);
    act(() => {
      markStorageReady();
    });

    // RedirectTo fires navigate('/welcome', { replace: true }) in an effect.
    expect(mockNavigate).toHaveBeenCalledWith("/welcome", { replace: true });
    expect(screen.queryByTestId("hub-home")).toBeNull();
  });

  it("renders the hub home (no redirect) for a returning user when storage is ready", () => {
    // storageReady defaults true; shouldShowOnboarding=false → hub, not /welcome.
    renderHubAtRoot();

    expect(screen.getByTestId("hub-home")).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith("/welcome", {
      replace: true,
    });
  });

  it("redirects legacy ?module URLs to the active path while preserving hash", async () => {
    mockShell.activeModule = "finyk";
    renderHubAtEntry("/?module=legacy#cashflow");

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/finyk#cashflow", {
        replace: true,
      }),
    );
    expect(mockRenderStandaloneRoute).not.toHaveBeenCalled();
  });

  it("renders standalone route output before onboarding checks", () => {
    mockRenderStandaloneRoute.mockReturnValue(
      <div data-testid="standalone-route">standalone</div>,
    );

    renderHubAtEntry("/pricing");

    expect(screen.getByTestId("standalone-route")).toBeInTheDocument();
    expect(mockRenderStandaloneRoute).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/pricing" }),
    );
    expect(mockShouldShowOnboarding).not.toHaveBeenCalled();
  });
});
