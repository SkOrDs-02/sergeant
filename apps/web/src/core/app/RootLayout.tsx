import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@shared/hooks/useTheme";
import { useKeyboardShortcutsModal } from "@shared/components/ui/KeyboardShortcutsModal";
import { useCommandPaletteHotkey } from "@shared/components/ui/CommandPalette";
import { useAuth } from "../auth/AuthContext";
import { useActivationV2Boot } from "../activation";
import { AppLock } from "../security/AppLock";
import { useAppLockContext } from "../security/AppLockContext";
import { setFlag, useFlag } from "../lib/featureFlags";
import { useDemoCommands } from "./useDemoCommands";
import { HubChatOverlay } from "../hub/HubChatOverlay";
import {
  HubChatOverlayProvider,
  useHubChatOverlay,
  useHubChatOverlayState,
} from "../hub/useHubChatOverlay";
import { APP_TITLE, SIGN_IN_PATH } from "./appPaths";
import { useHubKeyboardShortcuts } from "../hooks/useHubKeyboardShortcuts";
import { useBrowserLocation } from "../hooks/useBrowserLocation";
import { useHubNavigation } from "../hooks/useHubNavigation";
import { useHubUIState } from "../hooks/useHubUIState";
import { usePwaActions } from "../hooks/usePwaActions";
import { useAppEffects } from "./useAppEffects";
import { useIosInstallBanner } from "./useIosInstallBanner";
import { usePwaInstall } from "./usePwaInstall";
import { useSWUpdate } from "./useSWUpdate";
import { useNutritionDualWriteBoot } from "../../modules/nutrition/hooks/useNutritionDualWriteBoot";
import { useNutritionSqliteReadBoot } from "../../modules/nutrition/hooks/useNutritionSqliteReadBoot";
import { HubShellProvider, type HubShellValue } from "./HubShellContext";

// Side-effect-only child rendered exclusively for authenticated users.
function AuthenticatedNutritionBoot() {
  useNutritionDualWriteBoot();
  useNutritionSqliteReadBoot();
  return null;
}

function NutritionBootGate() {
  const { user } = useAuth();
  return user ? <AuthenticatedNutritionBoot /> : null;
}

/**
 * App shell wrapper — renders global UI (AppLock, HubChatOverlay,
 * NutritionBootGate) around the child route content. The `HubChatOverlay`
 * provider is owned by `RootLayout` (above this component) so the overlay
 * state is shared with `RootLayout`'s own consumers — see that component's
 * docstring.
 */
function AppShell({ children }: { children: React.ReactNode }) {
  const appLock = useAppLockContext();
  return (
    <>
      <AppLock
        state={appLock.state}
        onUnlock={appLock.unlock}
        onSetupDone={appLock.finishSetup}
        onSetupCancel={() => {
          setFlag("app-lock-enabled", false);
          appLock.finishSetup();
        }}
      />
      <NutritionBootGate />
      {children}
      <HubChatOverlay />
    </>
  );
}

/**
 * Outer layout route component (initiative 0006 Phase 5).
 *
 * Owns the HubChat overlay state and provides it ABOVE `RootLayoutInner`, so
 * every consumer inside the layout — the `useAppEffects` `openChat` hub-bus
 * listener, `hubShellValue.openAssistantChat`, and the `<HubChatOverlay/>`
 * sheet — shares one state. Previously the provider was created inside
 * `AppShell` (a descendant of these consumers), so they bound to the noop
 * fallback and the assistant FAB / Ctrl+/ shortcut never opened the overlay.
 */
export function RootLayout() {
  const chatOverlay = useHubChatOverlayState();
  return (
    <HubChatOverlayProvider value={chatOverlay}>
      <RootLayoutInner />
    </HubChatOverlayProvider>
  );
}

/**
 * Inner layout body. Runs global effects once, then renders matched child
 * routes via `<Outlet />`. Each child route gets a **different** component,
 * which fixes the React Router 7 location-context propagation bug
 * (mixed-shape match objects when multiple routes resolve to the same
 * `<App />`).
 *
 * Shared state (navigation, UI, PWA actions, auth) is provided via
 * `HubShellContext` so child routes don't need to call these hooks
 * independently.
 */
function RootLayoutInner() {
  const location = useLocation();
  const browserLocation = useBrowserLocation(location);
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(browserLocation.search);

  // Navigation FSM — determines activeModule from URL.
  // Destructure the individually-stable members up-front: `useHubNavigation`
  // returns a fresh object literal each render, so depending on `navigation`
  // wholesale would invalidate the memoized callbacks below every render
  // (and re-register the keyboard-shortcut listeners). The members are the
  // correct, stable dependency set — `goToHub`/`openModule`/`goToModuleSettings`
  // are `useCallback`-wrapped and `activeModule` is primitive state.
  const navigation = useHubNavigation();
  const {
    activeModule,
    openModule,
    goToHub,
    goToModuleSettings,
    moduleAnimClass,
  } = navigation;

  // Hub UI state (search, hub view tab)
  const ui = useHubUIState();

  // PWA shortcut actions (from URL or localStorage)
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const { pwaAction, setPwaAction, clearPwaAction, validActions } =
    usePwaActions(searchParams);

  // Global side effects
  useTheme();
  useActivationV2Boot();

  // Keep the tab title pinned to the app name on every navigation. The
  // static <title> in index.html is set once at load; some sub-routes
  // (e.g. /nutrition/log) were observed dropping it, so the browser fell
  // back to showing the raw URL. Re-asserting it per pathname covers all
  // routes — module shells, standalone routes, and the 404.
  useEffect(() => {
    if (document.title !== APP_TITLE) {
      document.title = APP_TITLE;
    }
  }, [location.pathname]);

  // Registers the `?` hotkey for keyboard shortcuts modal (side-effect only).
  useKeyboardShortcutsModal();
  const { openChat: openAssistantChat } = useHubChatOverlay();
  const { canInstall, install, dismiss } = usePwaInstall();
  const { visible: iosVisible, dismiss: iosDismiss } = useIosInstallBanner();
  const { updateAvailable, applyUpdate } = useSWUpdate();
  const { user, isLoading: authLoading } = useAuth();

  // App-level effects (idle prefetch, SW messages, hub bus, etc.)
  useAppEffects({
    user,
    authLoading,
    ui,
    openModule,
    navigate,
    setPwaAction,
    validActions,
  });

  // Auth callback
  const openAuth = useCallback(() => navigate(SIGN_IN_PATH), [navigate]);

  // Keyboard shortcuts (work on all routes — hub + modules)
  const openSearchFromShortcut = useCallback(() => {
    if (activeModule) {
      goToHub();
      requestAnimationFrame(() => ui.setSearchOpen(true));
      return;
    }
    ui.setSearchOpen(true);
  }, [activeModule, goToHub, ui]);

  const handleNavigateChord = useCallback(
    (target: import("../hooks/useHubKeyboardShortcuts").NavChordTarget) => {
      if (target === "hub") {
        goToHub();
      } else {
        openModule(target);
      }
    },
    [goToHub, openModule],
  );

  useHubKeyboardShortcuts({
    onOpenSearch: openSearchFromShortcut,
    onOpenShortcuts: () => setShortcutsOpen(true),
    onOpenAssistant: openAssistantChat,
    onNavigate: handleNavigateChord,
  });

  // Command palette (⌘K)
  const paletteEnabled = useFlag("hub_command_palette");
  useCommandPaletteHotkey(paletteEnabled);
  useDemoCommands();

  // Build the context value for child routes
  const hubShellValue: HubShellValue = {
    activeModule,
    openModule,
    goToHub,
    goToModuleSettings,
    moduleAnimClass,
    ui,
    pwaAction,
    clearPwaAction,
    user,
    authLoading,
    shortcutsOpen,
    onCloseShortcuts: closeShortcuts,
    canInstall,
    onInstall: install,
    onDismissInstall: dismiss,
    iosVisible,
    onDismissIos: iosDismiss,
    updateAvailable,
    onApplyUpdate: applyUpdate,
    openAssistantChat,
    onOpenAuth: openAuth,
  };

  return (
    <HubShellProvider value={hubShellValue}>
      <AppShell>
        <Outlet />
      </AppShell>
    </HubShellProvider>
  );
}
