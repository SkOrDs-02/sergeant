import { Suspense, type ReactNode } from "react";
import { lazyImport } from "../lib/lazyImport";
import { shouldShowOnboarding } from "../onboarding/onboardingGate";
import { PageLoader } from "./PageLoader";
import { RedirectTo } from "./RedirectTo";
import {
  ASSISTANT_PATH,
  CHAT_PATH,
  DESIGN_PATH,
  KNOWN_PATHS,
  PRICING_PATH,
  STATUS_PATH,
  PROFILE_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_PATH,
  WELCOME_PATH,
  isPathBasedModulePath,
} from "./appPaths";
import type { useAuth } from "../auth/AuthContext";

type AuthUser = ReturnType<typeof useAuth>["user"];

// Welcome / Onboarding chunk: lazy-loaded so the ~2k LOC onboarding flow
// (`WelcomeScreen` + `OnboardingWizard` + per-module `seedDemoData/*`) stays
// out of the eager app shell. Returning users bypass it entirely; first-time
// users redirect to `/welcome` via `shouldShowOnboarding()` and pay the
// one-time fetch cost on the splash screen.
const WelcomeScreen = lazyImport(
  () => import("./WelcomeScreen"),
  "WelcomeScreen",
);
const AuthPage = lazyImport(() => import("../auth/AuthPage"), "AuthPage");
const ResetPasswordPage = lazyImport(
  () => import("../auth/ResetPasswordPage"),
  "ResetPasswordPage",
);
const DesignShowcase = lazyImport(
  () => import("../DesignShowcase"),
  "DesignShowcase",
);
const AssistantCataloguePage = lazyImport(
  () => import("../AssistantCataloguePage"),
  "AssistantCataloguePage",
);
const PricingPage = lazyImport(() => import("../PricingPage"), "PricingPage");
const LandingPage = lazyImport(() => import("../LandingPage"), "LandingPage");
const StatusPage = lazyImport(
  () => import("../status/StatusPage"),
  "StatusPage",
);
const HubChatPage = lazyImport(
  () => import("../hub/HubChatPage"),
  "HubChatPage",
);
const NotFoundPage = lazyImport(
  () => import("../NotFoundPage"),
  "NotFoundPage",
);

export interface StandaloneRouteArgs {
  pathname: string;
  user: AuthUser;
  authLoading: boolean;
  onLeaveAuth: () => void;
  onLeaveWelcome: () => void;
  onOpenAuth: () => void;
  onAssistantClose: () => void;
}

/**
 * A single URL-addressable surface that lives **outside** the Hub
 * composition. Each entry owns one path (or a small explicit set of
 * paths) and returns the JSX to render — or `null` to fall through to
 * the next entry.
 *
 * Web deep-dive 2026-05-03 §1.2 flagged the original 100-line
 * imperative `if (pathname === X)` ladder as fragile: adding a new
 * standalone surface required parallel edits in `appPaths.ts`,
 * `StandaloneRoutes.tsx`, and (sometimes) `useAppEffects.ts` with no
 * shared type to keep them in sync. The registry below collapses the
 * ladder into a typed list, the catch-all 404 lives once at the bottom,
 * and the exhaustiveness contract (every `KNOWN_PATHS` member must be
 * owned by some entry) is now testable in
 * `StandaloneRoutes.test.tsx` rather than relying on review discipline.
 */
interface StandaloneRoute {
  /** Path(s) this entry owns. `"*"` means "no path predicate — entry decides on its own". */
  readonly paths: ReadonlyArray<string>;
  readonly render: (args: StandaloneRouteArgs) => ReactNode;
}

const STANDALONE_ROUTES: ReadonlyArray<StandaloneRoute> = [
  // `/` — public landing page for non-auth visitors (initiative 0010
  // Phase 6.1, audit `2026-05-13-revenue-monetization-roast.md` §P1-3).
  // We only render the marketing surface when there's no session AND
  // no existing local data: that keeps local-first users (who never
  // signed up but already populated the app) on their Hub home, and
  // keeps the funnel-targeted landing for genuine fresh visitors.
  // Authed users + warm local-first installs fall through to the
  // existing Hub composition by returning `null`.
  {
    paths: ["/"],
    render: ({ user, authLoading, onLeaveWelcome }) => {
      if (authLoading || user) return null;
      if (!shouldShowOnboarding()) return null;
      return (
        <Suspense fallback={<PageLoader />}>
          <div className="page-enter">
            <LandingPage onContinueWithoutAccount={onLeaveWelcome} />
          </div>
        </Suspense>
      );
    },
  },

  // `/sign-in` is a URL-addressable auth entry. Already-authenticated
  // users landing here (e.g. from a stale link or from tapping "Вже маю
  // акаунт" after logging in on another tab) get redirected straight
  // back to `/` — no need to re-prompt for credentials they already
  // have. We defer the redirect until `authLoading` settles, otherwise
  // a freshly-mounted session would briefly bounce the user away from
  // the form before `user` hydrates.
  {
    paths: [SIGN_IN_PATH],
    render: ({ user, authLoading, onLeaveAuth }) => {
      if (!authLoading && user) {
        return <RedirectTo to="/" />;
      }
      return (
        <Suspense fallback={<PageLoader />}>
          <div className="page-enter">
            <AuthPage onContinueWithoutAccount={onLeaveAuth} />
          </div>
        </Suspense>
      );
    },
  },

  // `/reset-password` is the Better Auth magic-link landing page. We
  // render it unconditionally — even for logged-in users — because the
  // token may belong to a different account they want to recover.
  {
    paths: [RESET_PASSWORD_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <ResetPasswordPage />
        </div>
      </Suspense>
    ),
  },

  // `/profile` is a legacy deep-link target — profile actions now live
  // behind the bottom-nav `Профіль` tab inside the hub. Redirect to
  // the hub with the `profile` tab pre-activated so old links keep
  // working (and so the back button still pops the entry off history
  // instead of bouncing the user back here).
  {
    paths: [PROFILE_PATH],
    render: ({ user, authLoading }) => {
      if (authLoading) {
        return <PageLoader />;
      }
      if (!user) {
        return <RedirectTo to={SIGN_IN_PATH} />;
      }
      return <RedirectTo to="/?tab=profile" />;
    },
  },

  {
    paths: [DESIGN_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <DesignShowcase />
      </Suspense>
    ),
  },

  // `/pricing` — Phase 0 monetization рейки: статична сторінка з тарифами
  // і waitlist-формою. Анонімна (auth не вимагається), бо основний
  // траффік — неавторизовані відвідувачі, які ще не зробили sign-up.
  {
    paths: [PRICING_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <PricingPage />
        </div>
      </Suspense>
    ),
  },

  // `/status` — public health page (PR-41). Anonymous: fetches
  // `/api/status` and renders per-component status badges. Founder-
  // Pulse + public-trust surface; must remain reachable without a
  // session so external monitors (and worried users) can sanity-check
  // the service.
  {
    paths: [STATUS_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <StatusPage />
        </div>
      </Suspense>
    ),
  },

  {
    paths: [ASSISTANT_PATH],
    render: ({ onAssistantClose }) => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <AssistantCataloguePage onClose={onAssistantClose} />
        </div>
      </Suspense>
    ),
  },

  {
    paths: [CHAT_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <HubChatPage />
      </Suspense>
    ),
  },

  // `/welcome` is the cold-start surface. A returning user who somehow
  // lands here (stale link, auto-complete, shared URL) bounces back to
  // the dashboard instead of being asked to re-onboard.
  {
    paths: [WELCOME_PATH],
    render: ({ onLeaveWelcome, onOpenAuth }) => {
      if (!shouldShowOnboarding()) {
        return <RedirectTo to="/" />;
      }
      return <WelcomeScreen onDone={onLeaveWelcome} onOpenAuth={onOpenAuth} />;
    },
  },
];

/**
 * Static set of all paths owned by `STANDALONE_ROUTES`. Used by
 * `StandaloneRoutes.test.tsx` to verify the exhaustiveness contract:
 * every member of `KNOWN_PATHS` must be mapped here. The Hub root `/`
 * is now conditionally owned by the landing-page entry (P1-3) — the
 * entry returns `null` for warm local-first / authed sessions so the
 * Hub home keeps rendering, and the marketing surface only shows for
 * fresh non-auth visitors.
 *
 * Public for tests only; runtime callers should use
 * `renderStandaloneRoute()`.
 */
export const STANDALONE_ROUTE_PATHS: ReadonlySet<string> = new Set(
  STANDALONE_ROUTES.flatMap((entry) => entry.paths),
);

// Returns the JSX for any URL-addressable surface that lives **outside**
// the hub composition (sign-in, reset, marketing pages, deep-link 404).
// Returns `null` when no standalone route matches — the caller (AppInner)
// then falls through to the hub home shell or the active-module shell.
//
// Kept as a plain function (not a component) so AppInner can dispatch
// on the result with a normal `if (standalone) return standalone` —
// returning a component would force every render through this branch.
export function renderStandaloneRoute(args: StandaloneRouteArgs): ReactNode {
  const { pathname } = args;

  for (const entry of STANDALONE_ROUTES) {
    if (entry.paths.includes(pathname)) {
      return entry.render(args);
    }
  }

  // Unknown paths get a 404 instead of silently showing the dashboard.
  // Exception: paths owned by a migrated path-based module (`/finyk`,
  // `/nutrition`, plus their nested URLs like `/finyk/budgets` or
  // `/nutrition/log`) — those are handled by `useHubNavigation` →
  // `<ActiveModuleView />` further down the App shell, **not** by
  // `renderStandaloneRoute`. Without this exemption, every entry into
  // a migrated module short-circuits into `<NotFoundPage />` (regression
  // introduced together with `KNOWN_PATHS`-as-allowlist + 0006 Phase 2
  // when path-based modules were not added to the standalone-route
  // surface map).
  if (!KNOWN_PATHS.has(pathname) && !isPathBasedModulePath(pathname)) {
    return (
      <Suspense fallback={<PageLoader />}>
        <NotFoundPage />
      </Suspense>
    );
  }

  return null;
}
