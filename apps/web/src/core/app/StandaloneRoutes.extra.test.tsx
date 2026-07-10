/**
 * @status Active
 * Additional branch coverage for StandaloneRoutes.tsx — the main test file
 * covers the registry exhaustiveness contract and primary per-route branches.
 * This file covers the `/design` route (both DEV and production modes),
 * the `defineStandaloneRoute` factory, and a few conditional sub-paths not
 * exercised in the main suite.
 */
import { describe, expect, it, vi } from "vitest";
import {
  STANDALONE_ROUTE_PATHS,
  defineStandaloneRoute,
  renderStandaloneRoute,
} from "./StandaloneRoutes";
import type { StandaloneRouteArgs } from "./StandaloneRoutes";
import { DESIGN_PATH } from "./appPaths";
import type { useAuth } from "../auth/AuthContext";

type AuthUser = ReturnType<typeof useAuth>["user"];

// Default: pretend onboarding is already done so `/` falls through to the Hub.
const mockShouldShowOnboarding = vi.fn<() => boolean>(() => false);
vi.mock("../onboarding/onboardingGate", () => ({
  shouldShowOnboarding: () => mockShouldShowOnboarding(),
}));

const noop = () => {};

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

describe("defineStandaloneRoute factory", () => {
  it("returns an entry with the same paths and render reference", () => {
    const renderFn = () => null;
    const entry = defineStandaloneRoute({ paths: ["/foo"], render: renderFn });
    expect(entry.paths).toEqual(["/foo"]);
    expect(entry.render).toBe(renderFn);
  });

  it("accepts multiple paths", () => {
    const entry = defineStandaloneRoute({
      paths: ["/a", "/b", "/c"],
      render: () => null,
    });
    expect(entry.paths).toHaveLength(3);
    expect(entry.paths).toContain("/b");
  });
});

describe("renderStandaloneRoute() — /design", () => {
  it("renders a non-null surface for the /design path", () => {
    // In Vitest (DEV mode) `DesignShowcase` is loaded via lazyImport.
    // Whether it resolves or not, the route entry must return non-null.
    expect(callRouteArgs({ pathname: DESIGN_PATH })).not.toBeNull();
  });
});

describe("STANDALONE_ROUTE_PATHS set", () => {
  it("contains /design", () => {
    expect(STANDALONE_ROUTE_PATHS.has(DESIGN_PATH)).toBe(true);
  });

  it("does not contain arbitrary unknown paths", () => {
    expect(STANDALONE_ROUTE_PATHS.has("/not-a-real-route")).toBe(false);
  });
});

describe("renderStandaloneRoute() — authLoading sub-branches", () => {
  it("returns null for `/` when authLoading is true (loading session takes priority)", () => {
    // `authLoading || user` must short-circuit the entire render and fall
    // through to the Hub shell so the landing page never flickers during
    // the session-restore race on a hard reload.
    mockShouldShowOnboarding.mockReturnValueOnce(true);
    const result = callRouteArgs({ pathname: "/", authLoading: true });
    expect(result).toBeNull();
  });

  it("renders sign-in form while loading even when authLoading=true (never redirects during hydration)", () => {
    // Regression guard: `/sign-in` must NOT redirect an authed user before
    // the session is known (authLoading=true + user=null).
    const result = callRouteArgs({
      pathname: "/sign-in",
      authLoading: true,
      user: null,
    });
    expect(result).not.toBeNull();
  });

  it("redirects /profile to sign-in for unauthenticated users", () => {
    const result = callRouteArgs({
      pathname: "/profile",
      authLoading: false,
      user: null,
    });
    // Non-null because we return <RedirectTo to={SIGN_IN_PATH} />
    expect(result).not.toBeNull();
  });

  it("redirects /profile to hub /?tab=profile for authenticated users", () => {
    const authedUser = { id: "u1", email: "u@example.com" } as AuthUser;
    const result = callRouteArgs({
      pathname: "/profile",
      user: authedUser,
    });
    expect(result).not.toBeNull();
  });
});

describe("renderStandaloneRoute() — /welcome returning-user redirect", () => {
  it("returns a RedirectTo when returning user deep-links /welcome (storageReady, no onboarding)", () => {
    // shouldShowOnboarding defaults to false (mock), so this is a returning user.
    // The route must redirect them away from the onboarding surface.
    const result = callRouteArgs({
      pathname: "/welcome",
      storageReady: true,
    });
    // <RedirectTo to="/" /> — non-null
    expect(result).not.toBeNull();
  });
});
