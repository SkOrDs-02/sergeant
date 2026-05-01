import {
  useCallback,
  useEffect,
  lazy,
  Suspense,
  type ComponentType,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@shared/lib/cn";
import { safeWriteLS } from "@shared/lib/storage";
import { SkipLink } from "@shared/components/ui/SkipLink";
import ModuleErrorBoundary from "./ModuleErrorBoundary";
import { useDarkMode } from "@shared/hooks/useDarkMode";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { ToastProvider, useToast } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { ScreenReaderAnnouncerProvider } from "@shared/components/ui/ScreenReaderAnnouncer";
import { HUB_OPEN_MODULE_EVENT } from "@shared/lib/hubNav";
import { onHubBus } from "@shared/lib/hubBus";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { apiClient } from "@shared/api";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useCloudSync } from "./cloudSync/useCloudSync";
import { useSyncErrorToast } from "./cloudSync/hook/useSyncErrorToast";
import { PageLoader } from "./app/PageLoader";
import { ModulePageLoader } from "@shared/components/ui/ModulePageLoader";
import { SuspenseWithMinDelay } from "@shared/components/ui/SuspenseWithMinDelay";
import { OfflineBanner } from "./app/OfflineBanner";
import { MigrationPrompt } from "./app/MigrationPrompt";
import { usePwaInstall } from "./app/usePwaInstall";
import { useIosInstallBanner } from "./app/useIosInstallBanner";
import { useSWUpdate } from "./app/useSWUpdate";
import { PWA_ACTION_KEY } from "./app/pwaAction";
import { HubHeader } from "./app/HubHeader";
import { HubBottomNav } from "./app/HubBottomNav";
import { HubMainContent } from "./app/HubMainContent";
import { HubFloatingActions } from "./app/HubFloatingActions";
import { HubModals } from "./app/HubModals";
import { ActiveWorkoutBanner } from "./app/ActiveWorkoutBanner";
import { WelcomeScreen } from "./app/WelcomeScreen";
import { shouldShowOnboarding } from "./onboarding/OnboardingWizard";
import { isFirstRealEntryDone } from "./onboarding/vibePicks";
import { hasAnyRealEntry } from "./onboarding/firstRealEntry";
import { useHubNavigation } from "./hooks/useHubNavigation";
import { useHubUIState } from "./hooks/useHubUIState";
import { usePwaActions, type PwaAction } from "./hooks/usePwaActions";
import { ShellDeepLinkBridge } from "./app/ShellDeepLinkBridge";
import { PageviewTracker } from "./observability/PageviewTracker";
import { HintsOrchestrator } from "./hints/HintsOrchestrator";
import {
  KeyboardShortcutsModal,
  useKeyboardShortcutsModal,
} from "@shared/components/ui/KeyboardShortcutsModal";
import { prefetchCriticalModules } from "./lib/useRoutePrefetch";

const AuthPage = lazy(() =>
  import("./auth/AuthPage").then((m) => ({ default: m.AuthPage })),
);
const ResetPasswordPage = lazy(() =>
  import("./auth/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const DesignShowcase = lazy(() =>
  import("./DesignShowcase").then((m) => ({ default: m.DesignShowcase })),
);
const AssistantCataloguePage = lazy(() =>
  import("./AssistantCataloguePage").then((m) => ({
    default: m.AssistantCataloguePage,
  })),
);
const PricingPage = lazy(() =>
  import("./PricingPage").then((m) => ({ default: m.PricingPage })),
);
interface ModuleAppProps {
  onBackToHub: () => void;
  pwaAction: PwaAction | null;
  onPwaActionConsumed: () => void;
  onOpenModule?: (module: string) => void;
}

const FinykApp = lazy<ComponentType<ModuleAppProps>>(
  () => import("../modules/finyk/FinykApp"),
);
const FizrukApp = lazy(() => import("../modules/fizruk/FizrukApp"));
const NutritionApp = lazy<ComponentType<ModuleAppProps>>(
  () => import("../modules/nutrition/NutritionApp"),
);
// Routine раніше імпортувалось синхронно — це зобов'язувало тягнути
// весь модуль у main chunk навіть для користувачів, що сидять у Фінікові.
// Ліниве завантаження збігається з іншими модулями (Suspense fallback
// та ModuleErrorBoundary уже огортають цей слот).
const RoutineApp = lazy<ComponentType<ModuleAppProps>>(
  () => import("../modules/routine/RoutineApp"),
);

export default function App() {
  return (
    <ToastProvider>
      <ToastContainer />
      {/*
        Screen reader announcer: mounts two `aria-live` regions
        (polite + assertive) at the app root. Any descendant can call
        `useAnnounce()` to surface dynamic state changes (toggles,
        expand/collapse, training completion, etc.) to assistive
        tech. Lives outside ApiClientProvider/AuthProvider so even
        unauthenticated screens (sign-in, onboarding) can announce.
      */}
      {/* Capacitor deep-link bridge: монтуємо ВСЕРЕДИНІ роутера (App
          рендериться під <BrowserRouter>), але поза AppInner, щоб
          bridge переживав ранні return-и в AppInner (/sign-in,
          /reset-password, /design тощо) — deep link може прилетіти у
          будь-який із цих станів. */}
      <ShellDeepLinkBridge />
      {/* PostHog `$pageview` tracker: монтуємо тут (всередині
          BrowserRouter, поза AuthProvider), щоб фіксувати pathname і
          в unauthenticated-шляхах (`/sign-in`, `/welcome`,
          `/reset-password`) — без цього onboarding / auth funnels
          у PostHog були б сліпими перед login-ом. */}
      <PageviewTracker />
      <ScreenReaderAnnouncerProvider>
        <ApiClientProvider client={apiClient}>
          <AuthProvider>
            <AppInner />
          </AuthProvider>
        </ApiClientProvider>
      </ScreenReaderAnnouncerProvider>
    </ToastProvider>
  );
}

// Auth lives at `/sign-in` rather than as an in-page overlay. This keeps
// the FTUX splash (`/`) as the true cold-start surface — the old
// `showAuth` boolean meant that a first-time visitor who tapped
// "Вже маю акаунт" bounced into the auth form with no URL change, so
// the back button, deep links, and shared URLs all misbehaved. Having
// a named route also lets us link straight to sign-in from emails,
// push-notification landing pages, etc.
const SIGN_IN_PATH = "/sign-in";
// Assistant capability catalogue (`/help`, Settings link, `?` button in
// chat input all converge here). URL-addressable so it survives reload
// and can be deep-linked from notifications / docs.
const ASSISTANT_PATH = "/assistant";
// URL-addressable cold-start splash. Having a real route (not just a
// modal overlay on `/`) means the splash can be deep-linked, shows the
// right title in history/back navigation, and — crucially — renders the
// populated-hub peek behind itself instead of hovering over an empty
// dashboard.
const WELCOME_PATH = "/welcome";
const RESET_PASSWORD_PATH = "/reset-password";
const PROFILE_PATH = "/profile";

// Tiny effect-only component so the redirect is a declarative render,
// not a `navigate()` call in the middle of AppInner — keeps the render
// phase free of side effects and avoids the React warning.
function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return <PageLoader />;
}

function AppInner() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const onSignInRoute = location.pathname === SIGN_IN_PATH;
  const onWelcomeRoute = location.pathname === WELCOME_PATH;
  const onResetPasswordRoute = location.pathname === RESET_PASSWORD_PATH;
  const onAssistantRoute = location.pathname === ASSISTANT_PATH;

  const openAuth = useCallback(() => {
    navigate(SIGN_IN_PATH);
  }, [navigate]);

  // «Поки що пропустити» на /sign-in:
  // 1. cold-start (онбординг не завершений) → /welcome (replace) — як раніше,
  //    щоб не «з’їсти» FTUX splash.
  // 2. warm-start, юзер прийшов з застосунку (натиснув user-icon у HubHeader,
  //    `location.key !== "default"`) → `navigate(-1)`. Це повертає на ту саму
  //    сторінку, з якої прийшов (наприклад, дашборд або сторінку модуля),
  //    а не до replace-/, який для повторного юзера виглядає як no-op.
  // 3. fallback (deep-link або refresh на /sign-in, `location.key === "default"`):
  //    `navigate("/", { replace: true })` — як раніше.
  const leaveAuth = useCallback(() => {
    if (shouldShowOnboarding()) {
      navigate(WELCOME_PATH, { replace: true });
      return;
    }
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  }, [navigate, location.key]);

  const leaveWelcome = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const { activeModule, openModule, goToHub, moduleAnimClass } =
    useHubNavigation();
  const ui = useHubUIState();
  const { pwaAction, setPwaAction, clearPwaAction, validActions } =
    usePwaActions(searchParams);
  const { dark, toggle: toggleDark } = useDarkMode();
  const keyboardShortcuts = useKeyboardShortcutsModal();
  const { canInstall, install, dismiss } = usePwaInstall();
  const { visible: iosVisible, dismiss: iosDismiss } = useIosInstallBanner();
  const online = useOnlineStatus();
  const { updateAvailable, applyUpdate } = useSWUpdate();
  const { user, isLoading: authLoading } = useAuth();
  const sync = useCloudSync(user);
  const toast = useToast();
  useSyncErrorToast(sync.syncErrorDetail, toast, sync.pushAll);

  // Prefetch critical module chunks once the main thread is free.
  // Previously hard-coded to `setTimeout(2000)`, which over-paid on fast
  // devices (idle by 200 ms) and under-paid on slow ones (still hydrating
  // at 2 s). `requestIdleCallback` lets the browser fire whenever the
  // initial-render burst is genuinely done; the 4 s `timeout` cap stops
  // a permanently-busy main thread from starving the prefetch entirely.
  // Safari ≤ 16 has no `requestIdleCallback`, so we keep the original
  // 2 s fallback for it.
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(() => prefetchCriticalModules(), {
        timeout: 4000,
      });
      return () => cancelIdleCallback(id);
    }
    const timer = setTimeout(() => {
      prefetchCriticalModules();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // If the user signs out while the «Профіль» tab is active, bounce the
  // hub back to the dashboard — the tab itself disappears from the
  // bottom nav (gated on `user`), and without this the main content
  // area would render nothing for the `profile` view.
  useEffect(() => {
    if (!user && ui.hubView === "profile") {
      ui.setHubView("dashboard");
    }
  }, [user, ui]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "OPEN_MODULE") {
        openModule(event.data.module);
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMessage);
      return () =>
        navigator.serviceWorker.removeEventListener("message", onMessage);
    }
  }, [openModule]);

  // Global signal to open chat from any page (e.g. ProfilePage memory bank,
  // AssistantCataloguePage, hint toasts). Routed through the typed
  // `hubBus` rather than `window.dispatchEvent` so the payload shape is
  // enforced at the type level (see `HubBusEvents.openChat`).
  const openChatStable = ui.openChat;
  useEffect(
    () =>
      onHubBus("openChat", (detail) => {
        navigate("/", { replace: true });
        requestAnimationFrame(() => {
          openChatStable(detail.message, { autoSend: detail.autoSend });
        });
      }),
    [openChatStable, navigate],
  );

  // Global signal to open HubSearch from any surface (used by hint
  // toasts). Mirrors the typed `openChat` contract on the same bus.
  const setSearchOpenStable = ui.setSearchOpen;
  useEffect(
    () =>
      onHubBus("openSearch", () => {
        setSearchOpenStable(true);
      }),
    [setSearchOpenStable],
  );

  useEffect(() => {
    const onHubOpen = (ev: Event) => {
      const detail =
        (
          ev as CustomEvent<{
            module?: string;
            hash?: string;
            action?: PwaAction;
          }>
        ).detail || {};
      const { module, hash, action } = detail;
      if (action && validActions.has(action)) {
        safeWriteLS(PWA_ACTION_KEY, action);
        setPwaAction(action);
      }
      openModule(module, hash ? { hash } : undefined);
    };
    window.addEventListener(HUB_OPEN_MODULE_EVENT, onHubOpen);
    return () => window.removeEventListener(HUB_OPEN_MODULE_EVENT, onHubOpen);
  }, [openModule, setPwaAction, validActions]);

  // Глобальний shortcut ⌘K / Ctrl+K → відкрити HubSearch. Ставимо
  // `preventDefault`, щоб не спрацював нативний focus-address-bar у
  // браузера. Не реагуємо, якщо пошук вже відкритий або фокус у
  // input/textarea — тоді ⌘K не має перехоплювати typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || (e.key !== "k" && e.key !== "K")) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (target && target.isContentEditable);
      if (inEditable) return;
      e.preventDefault();
      ui.setSearchOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ui]);

  if (sync.migrationPending) {
    return (
      <MigrationPrompt
        onUpload={sync.uploadLocalData}
        onSkip={sync.skipMigration}
        syncing={sync.syncing}
      />
    );
  }

  // `/sign-in` is a URL-addressable auth entry. Already-authenticated
  // users landing here (e.g. from a stale link or from tapping "Вже маю
  // акаунт" after logging in on another tab) get redirected straight
  // back to `/` — no need to re-prompt for credentials they already
  // have. We defer the redirect until `authLoading` settles, otherwise
  // a freshly-mounted session would briefly bounce the user away from
  // the form before `user` hydrates.
  if (onSignInRoute) {
    if (!authLoading && user) {
      return <RedirectTo to="/" />;
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <AuthPage onContinueWithoutAccount={leaveAuth} />
        </div>
      </Suspense>
    );
  }

  // `/reset-password` is the Better Auth magic-link landing page. We
  // render it unconditionally — even for logged-in users — because the
  // token may belong to a different account they want to recover.
  if (onResetPasswordRoute) {
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
  if (location.pathname === PROFILE_PATH) {
    if (authLoading) {
      return <PageLoader />;
    }
    if (!user) {
      return <RedirectTo to={SIGN_IN_PATH} />;
    }
    return <RedirectTo to="/?tab=profile" />;
  }

  if (location.pathname === "/design") {
    return (
      <Suspense fallback={<PageLoader />}>
        <DesignShowcase />
      </Suspense>
    );
  }

  // `/pricing` — Phase 0 monetization рейки: статична сторінка з тарифами
  // і waitlist-формою. Анонімна (auth не вимагається), бо основний
  // траффік — неавторизовані відвідувачі, які ще не зробили sign-up.
  if (location.pathname === "/pricing") {
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <PricingPage />
        </div>
      </Suspense>
    );
  }

  if (onAssistantRoute) {
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <AssistantCataloguePage onClose={() => navigate("/")} />
        </div>
      </Suspense>
    );
  }

  // `/welcome` is the cold-start surface. A returning user who somehow
  // lands here (stale link, auto-complete, shared URL) bounces back to
  // the dashboard instead of being asked to re-onboard.
  if (onWelcomeRoute) {
    if (!shouldShowOnboarding()) {
      return <RedirectTo to="/" />;
    }
    return <WelcomeScreen onDone={leaveWelcome} onOpenAuth={openAuth} />;
  }

  // First-time visitors at `/` get redirected to `/welcome` so the
  // splash is a real route (back button, deep links, peek-of-product
  // backdrop) rather than a modal over an empty dashboard.
  if (!activeModule && shouldShowOnboarding()) {
    return <RedirectTo to={WELCOME_PATH} />;
  }

  if (!activeModule) {
    // FTUX session = the window between the splash and the user's first
    // real (non-demo) entry. During this window we intentionally
    // suppress PWA install / iOS install / SW update banners and other
    // noisy chrome so the one signal on screen is the FirstActionRow.
    // The update banner comes back the moment a real entry is logged.
    // Important: after the onboarding route is finished, the hub must still
    // allow the user to sign in. Otherwise they can land on the dashboard
    // (no entries yet) with no discoverable auth entry point.
    const hasFirstRealEntry = hasAnyRealEntry();
    const inFtuxSession = !hasFirstRealEntry && !isFirstRealEntryDone();
    return (
      <div className="h-dvh bg-bg flex flex-col overflow-hidden safe-area-pt page-enter">
        <SkipLink />
        <HintsOrchestrator
          inFtuxSession={inFtuxSession}
          hasFirstRealEntry={hasFirstRealEntry}
        />
        {!online && <OfflineBanner />}

        <HubHeader
          onOpenSearch={() => ui.setSearchOpen(true)}
          user={user}
          authLoading={authLoading}
          onShowAuth={openAuth}
          dark={dark}
          onToggleDark={toggleDark}
          hideAuthButton={shouldShowOnboarding() && !user && inFtuxSession}
        />

        <HubMainContent
          updateAvailable={updateAvailable}
          onApplyUpdate={applyUpdate}
          canInstall={canInstall}
          onInstall={install}
          onDismissInstall={dismiss}
          onOpenModule={openModule}
          iosVisible={iosVisible}
          onDismissIos={iosDismiss}
          hubView={ui.hubView}
          onOpenChat={ui.openChat}
          syncing={sync.syncing}
          onSync={sync.pushAll}
          onPull={sync.pullAll}
          user={user}
          onShowAuth={openAuth}
          inFtuxSession={inFtuxSession}
        />

        <HubBottomNav
          hubView={ui.hubView}
          onChange={ui.setHubView}
          // «Звіти» — пустий екран без даних, тому ховаємо tab до
          // першого реального запису. Якщо юзер уже обрав «Звіти» і
          // потім стер дані — повертаємо його на дашборд, щоб не
          // лишався на неіснуючому табі.
          showReports={hasAnyRealEntry()}
          showProfile={!!user}
          onShowAuth={!user ? openAuth : undefined}
        />

        {/* Thumb-reach entry to the AI assistant. Always visible so the
            user can reach the assistant from anywhere on the hub. The
            `compact` variant is used here so the FAB offsets above the
            hub bottom nav identically to the module bottom nav. */}
        <HubFloatingActions onOpenChat={ui.openChat} compact />

        {/* Persistent shortcut back to an in-progress Fizruk workout.
            Hidden during FTUX so the splash stays single-CTA; otherwise
            visible whenever `fizruk_active_workout_id_v1` is set, so the
            user never loses the thread after jumping to another tab. */}
        <ActiveWorkoutBanner hidden={inFtuxSession} />

        <HubModals
          chatOpen={ui.chatOpen}
          chatMinimized={ui.chatMinimized}
          chatUnseenCount={ui.chatUnseenCount}
          onCloseChat={ui.closeChat}
          onMinimizeChat={ui.minimizeChat}
          onRestoreChat={ui.restoreChat}
          onUnseenChange={ui.setChatUnseenCount}
          chatInitialMessage={ui.chatInitialMessage}
          chatAutoSend={ui.chatAutoSend}
          onOpenCatalogue={() => {
            ui.closeChat();
            navigate(ASSISTANT_PATH);
          }}
          searchOpen={ui.searchOpen}
          onCloseSearch={ui.closeSearch}
          onOpenModule={openModule}
        />
        <KeyboardShortcutsModal
          open={keyboardShortcuts.open}
          onClose={keyboardShortcuts.onClose}
        />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-bg text-text overflow-hidden">
      <SkipLink />
      {!online && <OfflineBanner />}
      {/* Persistent "resume workout" shortcut — rendered in Finyk,
          Routine, Nutrition (but not inside Fizruk itself, where the
          in-module ActiveWorkoutPanel is already the primary surface).
          This is the "at transitions" part of the persistent-CTA
          requirement: switching modules mid-set must not bury the
          workout. */}
      {activeModule !== "fizruk" && <ActiveWorkoutBanner />}
      <SuspenseWithMinDelay
        fallback={
          <ModulePageLoader
            module={
              activeModule as "finyk" | "fizruk" | "routine" | "nutrition"
            }
          />
        }
      >
        {/* Skip-link target. We render `<main>` by default so every screen
            exposes a `main` landmark for AT users. One exception: the
            Routine module renders its own `<main id="routine-main">`
            internally (src/modules/routine/RoutineApp.tsx) — in that case
            we fall back to `<div>` here so the DOM never has two visible
            `<main>` elements (HTML spec violation, confuses AT landmark
            navigation). Either way, the SkipLink's target contract
            (`id="main"` + focusability) is preserved. */}
        {(() => {
          const Tag = activeModule === "routine" ? "div" : "main";
          return (
            <Tag
              key={activeModule}
              id="main"
              tabIndex={-1}
              className={cn(
                moduleAnimClass,
                "h-full flex flex-col outline-none",
              )}
            >
              <ModuleErrorBoundary onBackToHub={goToHub}>
                {activeModule === "finyk" && (
                  <FinykApp
                    onBackToHub={goToHub}
                    pwaAction={pwaAction}
                    onPwaActionConsumed={clearPwaAction}
                  />
                )}
                {activeModule === "fizruk" && (
                  <FizrukApp
                    onBackToHub={goToHub}
                    onOpenModule={openModule}
                    pwaAction={pwaAction}
                    onPwaActionConsumed={clearPwaAction}
                  />
                )}
                {activeModule === "routine" && (
                  <RoutineApp
                    onBackToHub={goToHub}
                    onOpenModule={openModule}
                    pwaAction={pwaAction}
                    onPwaActionConsumed={clearPwaAction}
                  />
                )}
                {activeModule === "nutrition" && (
                  <NutritionApp
                    onBackToHub={goToHub}
                    pwaAction={pwaAction}
                    onPwaActionConsumed={clearPwaAction}
                  />
                )}
              </ModuleErrorBoundary>
            </Tag>
          );
        })()}
      </SuspenseWithMinDelay>
      {/* Assistant FAB — available in all module views so the user can
          reach the AI chat without navigating back to the hub first.
          Compact mode uses a small icon-only button to minimize overlap. */}
      <HubFloatingActions onOpenChat={ui.openChat} compact />
      <HubModals
        chatOpen={ui.chatOpen}
        chatMinimized={ui.chatMinimized}
        chatUnseenCount={ui.chatUnseenCount}
        onCloseChat={ui.closeChat}
        onMinimizeChat={ui.minimizeChat}
        onRestoreChat={ui.restoreChat}
        onUnseenChange={ui.setChatUnseenCount}
        chatInitialMessage={ui.chatInitialMessage}
        chatAutoSend={ui.chatAutoSend}
        onOpenCatalogue={() => {
          ui.closeChat();
          navigate(ASSISTANT_PATH);
        }}
        searchOpen={ui.searchOpen}
        onCloseSearch={ui.closeSearch}
        onOpenModule={openModule}
      />
      <KeyboardShortcutsModal
        open={keyboardShortcuts.open}
        onClose={keyboardShortcuts.onClose}
      />
    </div>
  );
}
