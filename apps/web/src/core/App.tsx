import {
  useCallback,
  useEffect,
  lazy,
  useState,
  Suspense,
  type ComponentType,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@shared/lib/cn";
import { SkipLink } from "@shared/components/ui/SkipLink";
import ModuleErrorBoundary from "./ModuleErrorBoundary";
import { useDarkMode } from "@shared/hooks/useDarkMode";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { KeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";
import { HUB_OPEN_MODULE_EVENT } from "@shared/lib/hubNav";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { apiClient } from "@shared/api";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { useCloudSync } from "./cloudSync/useCloudSync";
import { PageLoader } from "./app/PageLoader";
import { OfflineBanner } from "./app/OfflineBanner";
import { MigrationPrompt } from "./app/MigrationPrompt";
import { usePwaInstall } from "./app/usePwaInstall";
import { useIosInstallBanner } from "./app/useIosInstallBanner";
import { useSWUpdate } from "./app/useSWUpdate";
import { PWA_ACTION_KEY } from "./app/pwaAction";
import { HubHeader } from "./app/HubHeader";
import { HubTabs } from "./app/HubTabs";
import { HubMainContent } from "./app/HubMainContent";
import { HubFloatingActions } from "./app/HubFloatingActions";
import { HubModals } from "./app/HubModals";
import { ActiveWorkoutBanner } from "./app/ActiveWorkoutBanner";
import { WelcomeScreen } from "./app/WelcomeScreen";
import { shouldShowOnboarding } from "./onboarding/OnboardingWizard";
import { isFirstRealEntryDone } from "./onboarding/vibePicks";
import { hasAnyRealEntry } from "./onboarding/firstRealEntry";
import { useHubNavigation } from "./hooks/useHubNavigation";
import { useHubKeyboardShortcuts } from "./hooks/useHubKeyboardShortcuts";
import { useHubUIState } from "./hooks/useHubUIState";
import { usePwaActions, type PwaAction } from "./hooks/usePwaActions";
import { ShellDeepLinkBridge } from "./app/ShellDeepLinkBridge";
import { HintsOrchestrator } from "./hints/HintsOrchestrator";

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
const ProfilePage = lazy(() =>
  import("./profile/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const AssistantCataloguePage = lazy(() =>
  import("./AssistantCataloguePage").then((m) => ({
    default: m.AssistantCataloguePage,
  })),
);
interface ModuleAppProps {
  onBackToHub: () => void;
  pwaAction?: PwaAction;
  onPwaActionConsumed?: () => void;
  onOpenModule?: (module: string) => void;
}

const FinykApp = lazy(
  () => import("../modules/finyk/FinykApp"),
) as unknown as ComponentType<ModuleAppProps>;
const FizrukApp = lazy(() => import("../modules/fizruk/FizrukApp"));
const NutritionApp = lazy(
  () => import("../modules/nutrition/NutritionApp"),
) as unknown as ComponentType<ModuleAppProps>;
// Routine раніше імпортувалось синхронно — це зобов'язувало тягнути
// весь модуль у main chunk навіть для користувачів, що сидять у Фінікові.
// Ліниве завантаження збігається з іншими модулями (Suspense fallback
// та ModuleErrorBoundary уже огортають цей слот).
const RoutineApp = lazy(
  () => import("../modules/routine/RoutineApp"),
) as unknown as ComponentType<ModuleAppProps>;

export default function App() {
  return (
    <ToastProvider>
      <ToastContainer />
      {/* Capacitor deep-link bridge: монтуємо ВСЕРЕДИНІ роутера (App
          рендериться під <BrowserRouter>), але поза AppInner, щоб
          bridge переживав ранні return-и в AppInner (/sign-in,
          /reset-password, /design тощо) — deep link може прилетіти у
          будь-який із цих станів. */}
      <ShellDeepLinkBridge />
      <ApiClientProvider client={apiClient}>
        <AuthProvider>
          <AppInner />
        </AuthProvider>
      </ApiClientProvider>
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
  const onProfileRoute = location.pathname === PROFILE_PATH;
  const onAssistantRoute = location.pathname === ASSISTANT_PATH;

  const openAuth = useCallback(() => {
    navigate(SIGN_IN_PATH);
  }, [navigate]);

  // «Продовжити без акаунту» на /sign-in для cold-start користувача має
  // завести його у FTUX splash (/welcome), а не на порожній дашборд.
  // Інакше тап «Вже маю акаунт» → назад стає тихим dead-end-ом, який
  // пропускає онбординг назавжди.
  const leaveAuth = useCallback(() => {
    if (shouldShowOnboarding()) {
      navigate(WELCOME_PATH, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const leaveWelcome = useCallback(() => {
    navigate("/", { replace: true });
  }, [navigate]);

  const { activeModule, openModule, goToHub, moduleAnimClass } =
    useHubNavigation();
  const ui = useHubUIState();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { pwaAction, setPwaAction, clearPwaAction, validActions } =
    usePwaActions(searchParams);
  const { dark, toggle: toggleDark } = useDarkMode();
  const { canInstall, install, dismiss } = usePwaInstall();
  const { visible: iosVisible, dismiss: iosDismiss } = useIosInstallBanner();
  const online = useOnlineStatus();
  const { updateAvailable, applyUpdate } = useSWUpdate();
  const { user, isLoading: authLoading, logout } = useAuth();
  const sync = useCloudSync(user);
  useEffect(() => {
    const onMessage = (event) => {
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

  // Global event to open chat from any page (e.g. ProfilePage memory bank,
  // AssistantCataloguePage). Detail accepts either a plain string (legacy:
  // prefill input) or `{message, autoSend}` (new: optional auto-send) so
  // existing emitters keep working without modification.
  const openChatStable = ui.openChat;
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | string
        | null
        | { message: string; autoSend?: boolean };
      navigate("/", { replace: true });
      requestAnimationFrame(() => {
        if (detail && typeof detail === "object" && "message" in detail) {
          openChatStable(detail.message, { autoSend: detail.autoSend });
        } else {
          openChatStable(detail as string | null);
        }
      });
    };
    window.addEventListener("hub:openChat", handler);
    return () => window.removeEventListener("hub:openChat", handler);
  }, [openChatStable, navigate]);

  // Global event to open HubSearch from any surface (used by hint toasts).
  // Mirrors the existing `hub:openChat` event contract.
  useEffect(() => {
    const handler = () => {
      ui.setSearchOpen(true);
    };
    window.addEventListener("hub:openSearch", handler as EventListener);
    return () =>
      window.removeEventListener("hub:openSearch", handler as EventListener);
  }, [ui]);

  useEffect(() => {
    const onHubOpen = (ev) => {
      const { module, hash, action } = ev.detail || {};
      if (action && validActions.has(action)) {
        try {
          localStorage.setItem(PWA_ACTION_KEY, action);
        } catch {
          /* noop */
        }
        setPwaAction(action);
      }
      openModule(module, hash ? { hash } : undefined);
    };
    window.addEventListener(HUB_OPEN_MODULE_EVENT, onHubOpen);
    return () => window.removeEventListener(HUB_OPEN_MODULE_EVENT, onHubOpen);
  }, [openModule, setPwaAction, validActions]);

  const openSearchFromShortcut = useCallback(() => {
    if (activeModule) {
      goToHub();
      requestAnimationFrame(() => ui.setSearchOpen(true));
      return;
    }
    ui.setSearchOpen(true);
  }, [activeModule, goToHub, ui]);

  useHubKeyboardShortcuts({
    onOpenSearch: openSearchFromShortcut,
    onOpenShortcuts: () => setShortcutsOpen(true),
  });

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

  if (onProfileRoute) {
    if (authLoading) {
      return <PageLoader />;
    }
    if (!user) {
      return <RedirectTo to={SIGN_IN_PATH} />;
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <div className="page-enter">
          <ProfilePage />
        </div>
      </Suspense>
    );
  }

  if (location.pathname === "/design") {
    return (
      <Suspense fallback={<PageLoader />}>
        <DesignShowcase />
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
    // suppress PWA install / iOS install / SW update banners and the
    // "Sign in" header button so the one signal on screen is the
    // FirstActionRow. The update banner comes back the moment a real
    // entry is logged.
    // Important: after the onboarding route is finished, the hub must still
    // allow the user to sign in. Otherwise they can land on the dashboard
    // (no entries yet) with no discoverable auth entry point.
    const inFtuxSession =
      shouldShowOnboarding() && !user && !isFirstRealEntryDone();
    return (
      <div className="min-h-dvh bg-bg flex flex-col safe-area-pt-pb page-enter">
        <SkipLink />
        <HintsOrchestrator
          inFtuxSession={inFtuxSession}
          hasFirstRealEntry={hasAnyRealEntry()}
        />
        {!online && <OfflineBanner />}

        <HubHeader
          onOpenSearch={() => ui.setSearchOpen(true)}
          user={user}
          syncing={sync.syncing}
          lastSync={sync.lastSync}
          onSync={sync.pushAll}
          onPull={sync.pullAll}
          onLogout={logout}
          authLoading={authLoading}
          onShowAuth={openAuth}
          dark={dark}
          onToggleDark={toggleDark}
          hideAuthButton={inFtuxSession}
        />

        <HubTabs
          hubView={ui.hubView}
          onChange={ui.setHubView}
          // «Звіти» — пустий екран без даних, тому ховаємо tab до
          // першого реального запису. Якщо юзер уже обрав «Звіти» і
          // потім стер дані — повертаємо його на дашборд, щоб не
          // лишався на неіснуючому табі.
          showReports={hasAnyRealEntry()}
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

        {/* Thumb-reach entry to the AI assistant. Module quick-add is
            handled above by `TodayFocusCard`'s chips (+ Витрата / + Їжа /
            + Звичка / + Тренування), so a separate add-speed-dial FAB
            would be a pure duplicate. Hidden during the FTUX session so
            the only interactive surface in view is the FirstActionHero
            → PresetSheet one-tap path; the FAB returns the moment the
            first real entry lands. */}
        <HubFloatingActions hidden={inFtuxSession} onOpenChat={ui.openChat} />

        {/* Persistent shortcut back to an in-progress Fizruk workout.
            Hidden during FTUX so the splash stays single-CTA; otherwise
            visible whenever `fizruk_active_workout_id_v1` is set, so the
            user never loses the thread after jumping to another tab. */}
        <ActiveWorkoutBanner hidden={inFtuxSession} />

        <HubModals
          chatOpen={ui.chatOpen}
          onCloseChat={ui.closeChat}
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
          open={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="h-dvh flex flex-col bg-bg text-text overflow-hidden">
      <SkipLink />
      {!online && <OfflineBanner />}
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      {/* Persistent "resume workout" shortcut — rendered in Finyk,
          Routine, Nutrition (but not inside Fizruk itself, where the
          in-module ActiveWorkoutPanel is already the primary surface).
          This is the "at transitions" part of the persistent-CTA
          requirement: switching modules mid-set must not bury the
          workout. */}
      {activeModule !== "fizruk" && <ActiveWorkoutBanner />}
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </div>
  );
}
