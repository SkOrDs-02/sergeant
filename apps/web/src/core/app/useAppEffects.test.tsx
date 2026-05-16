/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppEffects, type AppEffectsDeps } from "./useAppEffects";

// Regression guard for the «Профіль не перемикається» bug (PR #2935
// follow-up): a deep-link / refresh on `/?tab=profile` arrives at cold-
// start while `useAuth().isLoading === true` and `user === null`. The
// pre-fix effect read `!user && hubView === "profile"` and immediately
// bounced the hub to the dashboard — even though the user was in fact
// signed in and the `meQuery` was a millisecond from resolving.
function makeDeps(over: Partial<AppEffectsDeps> = {}): AppEffectsDeps {
  return {
    user: null,
    authLoading: true,
    ui: {
      searchOpen: false,
      hubView: "profile",
      setHubView: vi.fn(),
      setSearchOpen: vi.fn(),
      closeSearch: vi.fn(),
    },
    openModule: vi.fn(),
    navigate: vi.fn() as unknown as AppEffectsDeps["navigate"],
    setPwaAction: vi.fn(),
    validActions: new Set(),
    ...over,
  };
}

describe("useAppEffects — profile bounce on auth state", () => {
  it("does NOT bounce profile→dashboard while auth is still loading", () => {
    const setHubView = vi.fn();
    const deps = makeDeps({
      authLoading: true,
      user: null,
      ui: {
        searchOpen: false,
        hubView: "profile",
        setHubView,
        setSearchOpen: vi.fn(),
        closeSearch: vi.fn(),
      },
    });
    renderHook(() => useAppEffects(deps));
    expect(setHubView).not.toHaveBeenCalled();
  });

  it("bounces profile→dashboard after auth resolves to null (signed out)", () => {
    const setHubView = vi.fn();
    const deps = makeDeps({
      authLoading: false,
      user: null,
      ui: {
        searchOpen: false,
        hubView: "profile",
        setHubView,
        setSearchOpen: vi.fn(),
        closeSearch: vi.fn(),
      },
    });
    renderHook(() => useAppEffects(deps));
    expect(setHubView).toHaveBeenCalledWith("dashboard");
  });

  it("does NOT bounce profile→dashboard when user is signed in", () => {
    const setHubView = vi.fn();
    const deps = makeDeps({
      authLoading: false,
      user: {
        id: "u1",
        email: "u@e",
        name: null,
        image: null,
        emailVerified: true,
        createdAt: null,
      },
      ui: {
        searchOpen: false,
        hubView: "profile",
        setHubView,
        setSearchOpen: vi.fn(),
        closeSearch: vi.fn(),
      },
    });
    renderHook(() => useAppEffects(deps));
    expect(setHubView).not.toHaveBeenCalled();
  });

  it("does not re-run bounce when parent re-renders with a fresh `ui` object (same hubView)", () => {
    const setHubView = vi.fn();
    const initial = makeDeps({
      authLoading: false,
      user: null,
      ui: {
        searchOpen: false,
        hubView: "dashboard",
        setHubView,
        setSearchOpen: vi.fn(),
        closeSearch: vi.fn(),
      },
    });
    const { rerender } = renderHook(
      (props: AppEffectsDeps) => useAppEffects(props),
      {
        initialProps: initial,
      },
    );
    // Simulate `useHubUIState` returning a fresh object each render while
    // `hubView` and `setHubView` are stable — the bouncer must not fire.
    rerender({
      ...initial,
      ui: { ...initial.ui },
    });
    expect(setHubView).not.toHaveBeenCalled();
  });
});
