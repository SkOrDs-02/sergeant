import { describe, expect, it, vi } from "vitest";
import { renderStandaloneRoute } from "./StandaloneRoutes";
import type { useAuth } from "../auth/AuthContext";

type AuthUser = ReturnType<typeof useAuth>["user"];

vi.mock("../onboarding/OnboardingWizard", () => ({
  shouldShowOnboarding: () => false,
}));

const noop = () => {};

function callRoute(pathname: string, user: AuthUser = null) {
  return renderStandaloneRoute({
    pathname,
    user,
    authLoading: false,
    onLeaveAuth: noop,
    onLeaveWelcome: noop,
    onOpenAuth: noop,
    onAssistantClose: noop,
  });
}

describe("renderStandaloneRoute()", () => {
  it("returns `null` for `/` so the App shell renders the hub home", () => {
    expect(callRoute("/")).toBeNull();
  });

  it("returns `null` for path-based module roots (regression: BUG #2132 follow-up)", () => {
    // `/finyk` and `/nutrition` are owned by `useHubNavigation` →
    // `<ActiveModuleView />`, NOT by `renderStandaloneRoute`. Returning
    // a non-null value here short-circuits the App shell into the 404
    // page (the user-reported "Сторінку не знайдено" symptom from
    // initiative 0006 Phase 2).
    expect(callRoute("/finyk")).toBeNull();
    expect(callRoute("/nutrition")).toBeNull();
  });

  it("returns `null` for nested path-based module URLs", () => {
    // Sub-routes (`/finyk/budgets`, `/nutrition/log`) must also fall
    // through to the active-module shell — they're handled by the
    // domain-local routers (`useFinykRoute`, `useNutritionRoute`).
    expect(callRoute("/finyk/budgets")).toBeNull();
    expect(callRoute("/finyk/cards")).toBeNull();
    expect(callRoute("/nutrition/log")).toBeNull();
    expect(callRoute("/nutrition/pantry/shopping")).toBeNull();
  });

  it("returns the 404 surface for genuinely unknown paths", () => {
    // A path that's neither in `KNOWN_PATHS` nor a path-based-module
    // root must still 404 — that's the original guard intent.
    const result = callRoute("/some-random-bogus-path");
    expect(result).not.toBeNull();
  });

  it("returns the 404 surface for prefix-aliased pseudo-modules (boundary check)", () => {
    // `/finykfoo` and `/nutritionish` are NOT path-based modules —
    // they should still 404, matching the boundary in
    // `isPathBasedModulePath()`.
    expect(callRoute("/finykfoo")).not.toBeNull();
    expect(callRoute("/nutritionish")).not.toBeNull();
  });
});
