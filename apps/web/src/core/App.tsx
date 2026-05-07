import { useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { apiClient } from "@shared/api";
import { useDarkMode } from "@shared/hooks/useDarkMode";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { ScreenReaderAnnouncerProvider } from "@shared/components/ui/ScreenReaderAnnouncer";
import {
  useKeyboardShortcutsModal,
  ShortcutRegistryProvider,
} from "@shared/components/ui/KeyboardShortcutsModal";

import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppLock } from "./security/AppLock";
import { AppLockProvider, useAppLockContext } from "./security/AppLockContext";
import { setFlag } from "./lib/featureFlags";
import { ActiveModuleView } from "./app/ActiveModuleView";
import { HubHomeView } from "./app/HubHomeView";
import { RedirectTo } from "./app/RedirectTo";
import { ShellDeepLinkBridge } from "./app/ShellDeepLinkBridge";
import { renderStandaloneRoute } from "./app/StandaloneRoutes";
import { useAppEffects } from "./app/useAppEffects";
import { useIosInstallBanner } from "./app/useIosInstallBanner";
import { usePwaInstall } from "./app/usePwaInstall";
import { useSWUpdate } from "./app/useSWUpdate";
import { SIGN_IN_PATH, WELCOME_PATH } from "./app/appPaths";
import { useHubKeyboardShortcuts } from "./hooks/useHubKeyboardShortcuts";
import { useHubNavigation } from "./hooks/useHubNavigation";
import { useHubUIState } from "./hooks/useHubUIState";
import { usePwaActions } from "./hooks/usePwaActions";
import { shouldShowOnboarding } from "./onboarding/OnboardingWizard";
import { PageviewTracker } from "./observability/PageviewTracker";

export default function App() {
  return (
    <ShortcutRegistryProvider>
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
              <AppLockProvider>
                <AppInnerWithLock />
              </AppLockProvider>
            </AuthProvider>
          </ApiClientProvider>
        </ScreenReaderAnnouncerProvider>
      </ToastProvider>
    </ShortcutRegistryProvider>
  );
}

function AppInnerWithLock() {
  const appLock = useAppLockContext();
  return (
    <>
      <AppLock
        state={appLock.state}
        onUnlock={appLock.unlock}
        onSetupDone={appLock.finishSetup}
        onSetupCancel={() => {
          // If user cancels setup, turn the flag off so the toggle reverts.
          setFlag("app-lock-enabled", false);
          appLock.finishSetup();
        }}
      />
      <AppInner />
    </>
  );
}

function AppInner() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const openAuth = useCallback(() => {
    navigate(SIGN_IN_PATH);
  }, [navigate]);

  // «Поки що пропустити» на /sign-in:
  // 1. cold-start (онбординг не завершений) → /welcome (replace) — як раніше,
  //    щоб не «з'їсти» FTUX splash.
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

  const onAssistantClose = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const {
    activeModule,
    openModule,
    goToHub,
    goToModuleSettings,
    moduleAnimClass,
  } = useHubNavigation();
  const ui = useHubUIState();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const { pwaAction, setPwaAction, clearPwaAction, validActions } =
    usePwaActions(searchParams);
  const { dark, toggle: toggleDark } = useDarkMode();
  const keyboardShortcuts = useKeyboardShortcutsModal();
  const { canInstall, install, dismiss } = usePwaInstall();
  const { visible: iosVisible, dismiss: iosDismiss } = useIosInstallBanner();
  const { updateAvailable, applyUpdate } = useSWUpdate();
  const { user, isLoading: authLoading } = useAuth();

  useAppEffects({
    user,
    ui,
    openModule,
    navigate,
    setPwaAction,
    validActions,
  });

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

  // URL-addressable surfaces that live outside the hub composition
  // (sign-in, reset-password, /design, /pricing, /assistant, /chat,
  // /welcome, 404). When `null` is returned, no standalone route
  // matched and we fall through to the hub home / active-module shell.
  const standalone = renderStandaloneRoute({
    pathname: location.pathname,
    user,
    authLoading,
    onLeaveAuth: leaveAuth,
    onLeaveWelcome: leaveWelcome,
    onOpenAuth: openAuth,
    onAssistantClose,
  });
  if (standalone) {
    // `/profile` redirects mid-flight while auth is still loading and
    // therefore needs the standalone branch to be able to short-circuit
    // the hub even though it returns a `<PageLoader />`. The function
    // returns `null` (and we fall through) only when no surface owns
    // the current path.
    return <>{standalone}</>;
  }

  // First-time visitors at `/` get redirected to `/welcome` so the
  // splash is a real route (back button, deep links, peek-of-product
  // backdrop) rather than a modal over an empty dashboard.
  if (!activeModule && shouldShowOnboarding()) {
    return <RedirectTo to={WELCOME_PATH} />;
  }

  if (!activeModule) {
    return (
      <HubHomeView
        ui={ui}
        user={user}
        authLoading={authLoading}
        onOpenAuth={openAuth}
        dark={dark}
        onToggleDark={toggleDark}
        canInstall={canInstall}
        onInstall={install}
        onDismissInstall={dismiss}
        iosVisible={iosVisible}
        onDismissIos={iosDismiss}
        updateAvailable={updateAvailable}
        onApplyUpdate={applyUpdate}
        openModule={openModule}
        shortcutsOpen={shortcutsOpen}
        onCloseShortcuts={closeShortcuts}
      />
    );
  }

  return (
    <ActiveModuleView
      activeModule={activeModule}
      goToHub={goToHub}
      goToModuleSettings={goToModuleSettings}
      openModule={openModule}
      moduleAnimClass={moduleAnimClass}
      ui={ui}
      pwaAction={pwaAction}
      clearPwaAction={clearPwaAction}
      shortcutsOpen={keyboardShortcuts.open}
      onCloseShortcuts={keyboardShortcuts.onClose}
    />
  );
}
