import { useCallback, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useDarkMode } from "@shared/hooks/useDarkMode";
import { useKeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";

import { useAuth } from "./auth/AuthContext";
import { AppLock } from "./security/AppLock";
import { useAppLockContext } from "./security/AppLockContext";
import { setFlag } from "./lib/featureFlags";
import { ActiveModuleView } from "./app/ActiveModuleView";
import { HubHomeView } from "./app/HubHomeView";
import { Providers } from "./app/Providers";
import { RedirectTo } from "./app/RedirectTo";
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
import { shouldShowOnboarding } from "./onboarding/onboardingGate";
import { useNutritionDualWriteBoot } from "../modules/nutrition/hooks/useNutritionDualWriteBoot";
import { useNutritionSqliteReadBoot } from "../modules/nutrition/hooks/useNutritionSqliteReadBoot";

export default function App() {
  // Provider tree (Shortcut → Toast → Announcer → ApiClient → Auth →
  // AppLock) plus the router-effect bridges (deep link, hash-redirect,
  // scroll-restoration, pageview) live in `./app/Providers`. The
  // invariant — every leaf can call `useToast()` / `useAnnounce()` /
  // `useAuth()` — is exercised by `App.test.tsx`. See the docstring
  // there for the rationale (Web deep-dive 2026-05-03 §1.1).
  return (
    <Providers>
      <AppInnerWithLock />
    </Providers>
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

  // Stage 8 PR #057n-tombstone: hoist the Nutrition dual-write +
  // SQLite-read boots from `NutritionApp` into the app shell so cross-
  // module callers (`core/settings/NotificationsSection`,
  // `core/settings/NutritionSection`, `nutritionBackup`) read the
  // SQLite warm cache and dual-write to the SQLite tables even when
  // the user has never opened the Nutrition module in this session.
  // Both hooks are idempotent — they latch on `userId` and the
  // module-level `booted` flag in `bootNutritionSqliteReadPath`.
  useNutritionDualWriteBoot();
  useNutritionSqliteReadBoot();

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
