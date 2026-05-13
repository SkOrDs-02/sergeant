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

// Returns the JSX for any URL-addressable surface that lives **outside**
// the hub composition (sign-in, reset, marketing pages, deep-link 404).
// Returns `null` when no standalone route matches — the caller (AppInner)
// then falls through to the hub home shell or the active-module shell.
//
// Kept as a plain function (not a component) so AppInner can dispatch
// on the result with a normal `if (standalone) return standalone` —
// returning a component would force every render through this branch.
export function renderStandaloneRoute(args: StandaloneRouteArgs): ReactNode {
  const {
    pathname,
    user,
    authLoading,
    onLeaveAuth,
    onLeaveWelcome,
    onOpenAuth,
    onAssistantClose,
  } = args;

  // `/sign-in` is a URL-addressable auth entry. Already-authenticated
  // users landing here (e.g. from a stale link or from tapping "Вже маю
  // акаунт" after logging in on another tab) get redirected straight
  // back to `/` — no need to re-prompt for credentials they already
  // have. We defer the redirect until `authLoading` settles, otherwise
  // a freshly-mounted session would briefly bounce the user away from
  // the form before `user` hydrates.
  if (pathname === SIGN_IN_PATH) {
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
  }

  // `/reset-password` is the Better Auth magic-link landing page. We
  // render it unconditionally — even for logged-in users — because the
  // token may belong to a different account they want to recover.
  if (pathname === RESET_PASSWORD_PATH) {
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <ResetPasswordPage />
        </div>
      </Suspense>
    );
  }

  // `/profile` is a legacy deep-link target — profile actions now live
  // behind the bottom-nav `Профіль` tab inside the hub. Redirect to
  // the hub with the `profile` tab pre-activated so old links keep
  // working (and so the back button still pops the entry off history
  // instead of bouncing the user back here).
  if (pathname === PROFILE_PATH) {
    if (authLoading) {
      return <PageLoader />;
    }
    if (!user) {
      return <RedirectTo to={SIGN_IN_PATH} />;
    }
    return <RedirectTo to="/?tab=profile" />;
  }

  if (pathname === DESIGN_PATH) {
    return (
      <Suspense fallback={<PageLoader />}>
        <DesignShowcase />
      </Suspense>
    );
  }

  // `/pricing` — Phase 0 monetization рейки: статична сторінка з тарифами
  // і waitlist-формою. Анонімна (auth не вимагається), бо основний
  // траффік — неавторизовані відвідувачі, які ще не зробили sign-up.
  if (pathname === PRICING_PATH) {
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <PricingPage />
        </div>
      </Suspense>
    );
  }

  if (pathname === ASSISTANT_PATH) {
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <AssistantCataloguePage onClose={onAssistantClose} />
        </div>
      </Suspense>
    );
  }

  if (pathname === CHAT_PATH) {
    return (
      <Suspense fallback={<PageLoader />}>
        <HubChatPage />
      </Suspense>
    );
  }

  // `/welcome` is the cold-start surface. A returning user who somehow
  // lands here (stale link, auto-complete, shared URL) bounces back to
  // the dashboard instead of being asked to re-onboard.
  if (pathname === WELCOME_PATH) {
    if (!shouldShowOnboarding()) {
      return <RedirectTo to="/" />;
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <WelcomeScreen onDone={onLeaveWelcome} onOpenAuth={onOpenAuth} />
      </Suspense>
    );
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
