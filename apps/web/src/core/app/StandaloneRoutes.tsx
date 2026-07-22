import { Suspense, type ReactNode } from "react";
import { lazyImport } from "../lib/lazyImport";
import { shouldShowOnboarding } from "../onboarding/onboardingGate";
import { PageLoader } from "./PageLoader";
import { RedirectTo } from "./RedirectTo";
import {
  ASSISTANT_PATH,
  CHAT_PATH,
  DESIGN_PATH,
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
  PRICING_PATH,
  STATUS_PATH,
  PROFILE_PATH,
  RESET_PASSWORD_PATH,
  SIGN_IN_ALIAS_PATHS,
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
// Internal styleguide — dev-only. The `import.meta.env.DEV` guard lets Vite
// statically drop the `import()` (and the whole DesignShowcase chunk) from
// the production bundle, mirroring `ReactQueryDevtools` in `main.tsx`.
const DesignShowcase = import.meta.env.DEV
  ? lazyImport(() => import("../DesignShowcase"), "DesignShowcase")
  : null;
const AssistantCataloguePage = lazyImport(
  () => import("../AssistantCataloguePage"),
  "AssistantCataloguePage",
);
const PricingPage = lazyImport(() => import("../PricingPage"), "PricingPage");
const LegalPage = lazyImport(() => import("../legal/LegalPage"), "LegalPage");
const StatusPage = lazyImport(
  () => import("../status/StatusPage"),
  "StatusPage",
);
const HubChatPage = lazyImport(
  () => import("../hub/HubChatPage"),
  "HubChatPage",
);
const NotFoundPage = lazyImport(
  () => import("../errors/NotFoundPage"),
  "NotFoundPage",
);

export interface StandaloneRouteArgs {
  pathname: string;
  user: AuthUser;
  authLoading: boolean;
  /**
   * Whether the SQLite-backed persistent store has resolved (see
   * `core/db/storageReady.ts`). Entries that branch on `shouldShowOnboarding()`
   * — `/` and `/welcome` — render a splash while this is `false` instead of
   * deciding against the empty pre-boot store (which would bounce a returning
   * user to `/welcome` / the marketing landing on a hard reload).
   */
  storageReady: boolean;
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

/**
 * Typed factory for standalone-route entries. Acts as a discriminated-union
 * constructor: callers get full inference on `render`'s return type while
 * `paths` is pinned to a `ReadonlyArray<string>` literal. Using the factory
 * (rather than bare object literals) makes the registry self-documenting and
 * enables future tooling — e.g. a codegen step that reads `paths` at build
 * time to emit a sitemap or validate deep-link contracts.
 *
 * `STANDALONE_ROUTES` is built exclusively via this factory so that every
 * entry participates in the same discriminated-union shape checked by
 * `StandaloneRoutes.test.tsx`.
 */
export function defineStandaloneRoute<
  TPaths extends ReadonlyArray<string>,
>(entry: {
  readonly paths: TPaths;
  readonly render: (args: StandaloneRouteArgs) => ReactNode;
}): StandaloneRoute {
  return entry;
}

const STANDALONE_ROUTES: ReadonlyArray<StandaloneRoute> = [
  // `/` — маршрут лишається в реєстрі ЛИШЕ заради контракту відомих
  // шляхів (`STANDALONE_ROUTE_PATHS` живить 404-гвардію нижче). Рендером
  // кореня володіє `HubPage`.
  //
  // Тут раніше жив маркетинговий `LandingPage` (initiative 0010 Phase 6.1).
  // Дизайн-аудит 2026-07 (цикл 3) виміряв, що він **недосяжний**: на
  // prod-збірці з живим API 0 із 5 свіжих візитерів його побачили. Причина —
  // гонка двох гейтів на ту саму умову: цей чекав на `authLoading`, а
  // редирект на `/welcome` у `HubPage` — ні, і локальний стор осідав раніше
  // за раунд-тріп до `/api/auth`. Вирок аудиту: не лагодити гонку, а зняти
  // маршрут — `/welcome` виконує роботу лендинга краще (цінність через
  // пікер, demo в один клік, воронка 3 кліки / 0 полів), і ставити
  // slop-екран ПЕРЕД найсильнішим екраном воронки немає сенсу.
  //
  // Після зняття рішення про корінь ухвалює рівно одна умова
  // (`storageReady` у `HubPage`) — гонки більше немає.
  defineStandaloneRoute({
    paths: ["/"],
    render: () => null,
  }),

  // `/sign-in` is a URL-addressable auth entry. Already-authenticated
  // users landing here (e.g. from a stale link or from tapping "Вже маю
  // акаунт" after logging in on another tab) get redirected straight
  // back to `/` — no need to re-prompt for credentials they already
  // have. We defer the redirect until `authLoading` settles, otherwise
  // a freshly-mounted session would briefly bounce the user away from
  // the form before `user` hydrates.
  defineStandaloneRoute({
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
  }),

  // `/login`, `/signin`, `/auth` — muscle-memory / external-link
  // aliases for the auth entry. They used to fall through to the 404
  // page (live-deploy audit 2026-06-11); a hard redirect keeps the
  // canonical URL shape (`/sign-in`) in history and in the URL bar.
  defineStandaloneRoute({
    paths: SIGN_IN_ALIAS_PATHS,
    render: () => <RedirectTo to={SIGN_IN_PATH} />,
  }),

  // `/reset-password` is the Better Auth magic-link landing page. We
  // render it unconditionally — even for logged-in users — because the
  // token may belong to a different account they want to recover.
  defineStandaloneRoute({
    paths: [RESET_PASSWORD_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <ResetPasswordPage />
        </div>
      </Suspense>
    ),
  }),

  // `/profile` is a legacy deep-link target — profile actions now live
  // behind the bottom-nav `Профіль` tab inside the hub. Redirect to
  // the hub with the `profile` tab pre-activated so old links keep
  // working (and so the back button still pops the entry off history
  // instead of bouncing the user back here).
  defineStandaloneRoute({
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
  }),

  // `/design` is the internal Design System 2.0 styleguide — it exposes
  // internal Hard Rules, raw tokens and per-section maturity (BETA) badges
  // that are not meant for end users. Gate it to dev builds: `DesignShowcase`
  // is `null` in production (see its dev-only declaration above), so the
  // route renders the 404 page there instead of the styleguide.
  defineStandaloneRoute({
    paths: [DESIGN_PATH],
    render: () =>
      DesignShowcase ? (
        <Suspense fallback={<PageLoader />}>
          <DesignShowcase />
        </Suspense>
      ) : (
        <Suspense fallback={<PageLoader />}>
          <NotFoundPage />
        </Suspense>
      ),
  }),

  // `/pricing` — Phase 0 monetization рейки: статична сторінка з тарифами
  // і waitlist-формою. Анонімна (auth не вимагається), бо основний
  // траффік — неавторизовані відвідувачі, які ще не зробили sign-up.
  // ОПТ-АУТ з `page-enter` — «one entry system per page» (Hard Rule #17).
  // `PricingPage` має власну вхідну хореографію (стагер тарифних карток),
  // і обгортка додавала другу: виміряно на prod 2 RESPONSE одночасно при
  // ліміті «1 AMBIENT + 1 RESPONSE». Правило прямо забороняє загортати
  // компонент із власним входом у ще один вхід. Той самий опт-аут уже де-факто
  // діяв для `/welcome` (він теж рендериться без `page-enter`) — тут він
  // просто стає явним.
  defineStandaloneRoute({
    paths: [PRICING_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <PricingPage />
      </Suspense>
    ),
  }),

  defineStandaloneRoute({
    paths: [
      LEGAL_PRIVACY_PATH,
      LEGAL_TERMS_PATH,
      LEGAL_COOKIES_PATH,
      LEGAL_OFFER_PATH,
    ],
    render: ({ pathname }) => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter h-app-dvh min-h-0 overflow-hidden">
          <LegalPage pathname={pathname} />
        </div>
      </Suspense>
    ),
  }),

  // `/status` — public health page (PR-41). Anonymous: fetches
  // `/api/status` and renders per-component status badges. Founder-
  // Pulse + public-trust surface; must remain reachable without a
  // session so external monitors (and worried users) can sanity-check
  // the service.
  defineStandaloneRoute({
    paths: [STATUS_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <StatusPage />
        </div>
      </Suspense>
    ),
  }),

  defineStandaloneRoute({
    paths: [ASSISTANT_PATH],
    render: ({ onAssistantClose }) => (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <AssistantCataloguePage onClose={onAssistantClose} />
        </div>
      </Suspense>
    ),
  }),

  defineStandaloneRoute({
    paths: [CHAT_PATH],
    render: () => (
      <Suspense fallback={<PageLoader />}>
        <HubChatPage />
      </Suspense>
    ),
  }),

  // `/welcome` is the cold-start surface. A returning user who somehow
  // lands here (stale link, auto-complete, shared URL) bounces back to
  // the dashboard instead of being asked to re-onboard.
  defineStandaloneRoute({
    paths: [WELCOME_PATH],
    render: ({ storageReady, onLeaveWelcome, onOpenAuth }) => {
      // Until the persistent store resolves we cannot tell a genuine first-time
      // visitor (show the splash screen) from a returning user who deep-linked
      // `/welcome` (bounce to `/`). Render a loader rather than flashing the
      // onboarding splash at a returning user mid cold-boot.
      if (!storageReady) {
        return <PageLoader />;
      }
      if (!shouldShowOnboarding()) {
        return <RedirectTo to="/" />;
      }
      return <WelcomeScreen onDone={onLeaveWelcome} onOpenAuth={onOpenAuth} />;
    },
  }),
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
  // introduced together with the KNOWN_PATHS allowlist + 0006 Phase 2
  // when path-based modules were not added to the standalone-route
  // surface map).
  //
  // Note: `STANDALONE_ROUTE_PATHS` is the source of truth here — we
  // check it directly instead of importing the derived `KNOWN_PATHS`
  // from `routes.ts`, which would create a circular dependency
  // (`routes.ts` imports `STANDALONE_ROUTE_PATHS` from this module).
  // Both sets are equivalent for this guard: every entry in
  // `STANDALONE_ROUTES` is in `STANDALONE_ROUTE_PATHS`, and `KNOWN_PATHS`
  // is `new Set(STANDALONE_ROUTE_PATHS)`.
  if (
    !STANDALONE_ROUTE_PATHS.has(pathname) &&
    !isPathBasedModulePath(pathname)
  ) {
    return (
      <Suspense fallback={<PageLoader />}>
        <NotFoundPage />
      </Suspense>
    );
  }

  return null;
}
