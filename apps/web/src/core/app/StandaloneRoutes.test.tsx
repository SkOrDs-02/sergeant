import { describe, expect, it, vi } from "vitest";
import {
  STANDALONE_ROUTE_PATHS,
  renderStandaloneRoute,
} from "./StandaloneRoutes";
import type { StandaloneRouteArgs } from "./StandaloneRoutes";
import { KNOWN_PATHS } from "./routes";
import type { useAuth } from "../auth/AuthContext";
import {
  SIGN_IN_PATH,
  SIGN_IN_ALIAS_PATHS,
  RESET_PASSWORD_PATH,
  PROFILE_PATH,
  PRICING_PATH,
  STATUS_PATH,
  ASSISTANT_PATH,
  CHAT_PATH,
  WELCOME_PATH,
} from "./appPaths";

type AuthUser = ReturnType<typeof useAuth>["user"];

// Default: pretend onboarding is already done so `/` falls through
// to the Hub. Per-test overrides via `mockShouldShowOnboarding.mockReturnValueOnce`
// flip the gate for the fresh-visitor branch.
const mockShouldShowOnboarding = vi.fn<() => boolean>(() => false);
vi.mock("../onboarding/onboardingGate", () => ({
  shouldShowOnboarding: () => mockShouldShowOnboarding(),
}));

const noop = () => {};

function callRoute(
  pathname: string,
  user: AuthUser = null,
  storageReady = true,
) {
  return renderStandaloneRoute({
    pathname,
    user,
    authLoading: false,
    storageReady,
    onLeaveAuth: noop,
    onLeaveWelcome: noop,
    onOpenAuth: noop,
    onAssistantClose: noop,
  });
}

describe("renderStandaloneRoute()", () => {
  it("returns `null` for `/` when an existing local-first user has data (no onboarding flag, no auth)", () => {
    // Local-first user (no session, but app already onboarded) MUST keep
    // falling through to the Hub home so the landing page doesn't ambush
    // them on every visit. `shouldShowOnboarding` defaults to `false` in
    // the mock so this asserts the regression boundary documented in
    // `audits/2026-05-13-revenue-monetization-roast.md` §P1-3.
    expect(callRoute("/")).toBeNull();
  });

  it("returns `null` for `/` when the user is authenticated", () => {
    // Authed visitors at `/` always belong to the Hub composition — the
    // marketing landing is for non-auth funnel targets only.
    mockShouldShowOnboarding.mockReturnValueOnce(true);
    const authedUser = { id: "u1", email: "u@example.com" } as AuthUser;
    expect(callRoute("/", authedUser)).toBeNull();
  });

  it("renders the landing surface for a fresh non-auth visitor at `/`", () => {
    // Fresh visitor: no session, no local-first data → marketing
    // landing must render so SEO / paid-acquisition traffic lands on a
    // CTA-bearing surface instead of the Hub shell.
    mockShouldShowOnboarding.mockReturnValueOnce(true);
    expect(callRoute("/")).not.toBeNull();
  });

  it("renders a splash for `/` while the persistent store is still booting (cold-boot race)", () => {
    // Returning local-first user mid hard-reload: the SQLite warm-cache is
    // empty, so `shouldShowOnboarding()` would misread them as a fresh visitor
    // and ambush them with the marketing landing. Until storage settles we must
    // render a loader and NOT consult the onboarding gate.
    mockShouldShowOnboarding.mockClear();
    const result = callRoute("/", null, /* storageReady */ false);
    expect(result).not.toBeNull();
    expect(mockShouldShowOnboarding).not.toHaveBeenCalled();
  });

  it("renders a splash for `/welcome` while the persistent store is still booting", () => {
    // A returning user who deep-links `/welcome` must not be flashed the
    // onboarding splash before the store resolves — and the gate (which has a
    // write side-effect) must not be consulted yet.
    mockShouldShowOnboarding.mockClear();
    const result = callRoute("/welcome", null, /* storageReady */ false);
    expect(result).not.toBeNull();
    expect(mockShouldShowOnboarding).not.toHaveBeenCalled();
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

  it("renders public legal pages without auth", () => {
    expect(callRoute("/legal/privacy")).not.toBeNull();
    expect(callRoute("/legal/terms")).not.toBeNull();
    expect(callRoute("/legal/cookies")).not.toBeNull();
    expect(callRoute("/legal/offer")).not.toBeNull();
  });
});

describe("STANDALONE_ROUTE_PATHS ↔ KNOWN_PATHS exhaustiveness (Web deep-dive §1.2)", () => {
  // The registry in `StandaloneRoutes.tsx` is the source of truth for
  // which paths render a standalone surface. `KNOWN_PATHS` in
  // `appPaths.ts` is the allowlist used by the 404 guard. These two
  // sets MUST agree — including `/`, which after P1-3 is conditionally
  // owned by the landing-page entry (returns `null` for warm
  // installs / authed users so the Hub home keeps rendering). Without
  // exhaustiveness either:
  //   (a) a path is in `KNOWN_PATHS` but no route renders it → silent
  //       fall-through to the Hub shell for a URL that should have a
  //       dedicated surface, OR
  //   (b) a route exists for a path that isn't in `KNOWN_PATHS` → the
  //       404 guard short-circuits it before the route runs.
  // Both are real regressions seen during the 0006-routing migration;
  // this test guards against them at CI time instead of relying on
  // review discipline. See `docs/audits/2026-05-13-web-architecture-state-roast.md`.

  it("every standalone-route path is also in KNOWN_PATHS", () => {
    for (const path of STANDALONE_ROUTE_PATHS) {
      expect(
        KNOWN_PATHS.has(path),
        `Standalone route owns "${path}" but KNOWN_PATHS does not — add it to appPaths.ts so the 404 guard doesn't short-circuit it.`,
      ).toBe(true);
    }
  });

  it("every KNOWN_PATHS entry is owned by a standalone route", () => {
    // After P1-3 (audit `2026-05-13-revenue-monetization-roast.md`),
    // `/` is also owned by `STANDALONE_ROUTES` — the entry conditionally
    // returns `null` for warm local-first / authed sessions and a
    // marketing surface for fresh non-auth visitors. The exhaustiveness
    // check no longer needs to skip the Hub root.
    //
    // This is also a tautology test now that `KNOWN_PATHS` is derived
    // from `STANDALONE_ROUTE_PATHS` in `routes.ts` — the two sets are
    // identical by construction. The test is kept so any future refactor
    // that breaks that derivation fails here explicitly.
    for (const path of KNOWN_PATHS) {
      expect(
        STANDALONE_ROUTE_PATHS.has(path),
        `KNOWN_PATHS contains "${path}" but no entry in STANDALONE_ROUTES renders it — add a route in StandaloneRoutes.tsx.`,
      ).toBe(true);
    }
  });

  it("path-based module roots are NOT in KNOWN_PATHS (404 guard exemption)", () => {
    // `/finyk`, `/nutrition` etc. are handled by `useHubNavigation` →
    // `<ActiveModuleView />`, not by standalone routes. They must be
    // absent from `KNOWN_PATHS` so the 404 guard doesn't short-circuit
    // them — the `isPathBasedModulePath()` exemption in
    // `renderStandaloneRoute()` handles the fallthrough instead.
    // (This test was previously in `appPaths.test.ts` but moved here
    // since `KNOWN_PATHS` now lives in `routes.ts` and importing it there
    // already pulls in the StandaloneRoutes dependency graph.)
    expect(KNOWN_PATHS.has("/finyk")).toBe(false);
    expect(KNOWN_PATHS.has("/nutrition")).toBe(false);
    expect(KNOWN_PATHS.has("/fizruk")).toBe(false);
    expect(KNOWN_PATHS.has("/routine")).toBe(false);
  });
});

// ─── Per-route render behaviour ────────────────────────────────────────────

function callRouteArgs(
  overrides: Partial<StandaloneRouteArgs> & { pathname: string },
): ReturnType<typeof renderStandaloneRoute> {
  return renderStandaloneRoute({
    user: null,
    authLoading: false,
    storageReady: true,
    onLeaveAuth: noop,
    onLeaveWelcome: noop,
    onOpenAuth: noop,
    onAssistantClose: noop,
    ...overrides,
  });
}

describe("renderStandaloneRoute() — /sign-in", () => {
  it("renders AuthPage for an unauthenticated visitor", () => {
    expect(callRouteArgs({ pathname: SIGN_IN_PATH })).not.toBeNull();
  });

  it("returns a redirect for an already-authenticated user", () => {
    const authedUser = { id: "u1", email: "u@example.com" } as AuthUser;
    // Non-null because it returns <RedirectTo> not the auth page
    expect(
      callRouteArgs({ pathname: SIGN_IN_PATH, user: authedUser }),
    ).not.toBeNull();
  });

  it("returns non-null during auth loading (shows AuthPage, not redirect)", () => {
    // When authLoading=true + user=null we still render the form, not a redirect
    expect(
      callRouteArgs({ pathname: SIGN_IN_PATH, authLoading: true }),
    ).not.toBeNull();
  });
});

describe("renderStandaloneRoute() — sign-in alias paths", () => {
  it.each(SIGN_IN_ALIAS_PATHS)("redirects %s to SIGN_IN_PATH", (alias) => {
    expect(callRouteArgs({ pathname: alias })).not.toBeNull();
  });
});

describe("renderStandaloneRoute() — /reset-password", () => {
  it("renders without auth", () => {
    expect(callRouteArgs({ pathname: RESET_PASSWORD_PATH })).not.toBeNull();
  });

  it("renders even when authenticated (recovery flow for different account)", () => {
    const authedUser = { id: "u1", email: "u@example.com" } as AuthUser;
    expect(
      callRouteArgs({ pathname: RESET_PASSWORD_PATH, user: authedUser }),
    ).not.toBeNull();
  });
});

describe("renderStandaloneRoute() — /profile", () => {
  it("renders a loader while auth is still loading", () => {
    expect(
      callRouteArgs({ pathname: PROFILE_PATH, authLoading: true }),
    ).not.toBeNull();
  });

  it("redirects to sign-in when not authenticated", () => {
    // No user + not loading → redirect
    expect(callRouteArgs({ pathname: PROFILE_PATH })).not.toBeNull();
  });

  it("redirects to hub /?tab=profile when authenticated", () => {
    const authedUser = { id: "u1", email: "u@example.com" } as AuthUser;
    expect(
      callRouteArgs({ pathname: PROFILE_PATH, user: authedUser }),
    ).not.toBeNull();
  });
});

describe("renderStandaloneRoute() — public utility pages", () => {
  it("renders the pricing page", () => {
    expect(callRouteArgs({ pathname: PRICING_PATH })).not.toBeNull();
  });

  it("renders the status page", () => {
    expect(callRouteArgs({ pathname: STATUS_PATH })).not.toBeNull();
  });

  it("renders the assistant catalogue page", () => {
    expect(callRouteArgs({ pathname: ASSISTANT_PATH })).not.toBeNull();
  });

  it("renders the hub chat page", () => {
    expect(callRouteArgs({ pathname: CHAT_PATH })).not.toBeNull();
  });
});

describe("renderStandaloneRoute() — /welcome", () => {
  it("renders WelcomeScreen for a genuine first-time visitor", () => {
    mockShouldShowOnboarding.mockReturnValueOnce(true);
    expect(
      callRouteArgs({ pathname: WELCOME_PATH, storageReady: true }),
    ).not.toBeNull();
  });

  it("returns a redirect for a returning user who deep-links /welcome", () => {
    // storageReady=true, shouldShowOnboarding=false → returning user
    expect(
      callRouteArgs({ pathname: WELCOME_PATH, storageReady: true }),
    ).not.toBeNull();
  });
});
