import { createContext, useContext, type ReactNode } from "react";
import type { HubNavigation, HubModuleId } from "../hooks/useHubNavigation";
import type { HubUIState } from "../hooks/useHubUIState";
import type { PwaAction } from "../hooks/usePwaActions";
import type { useAuth } from "../auth/AuthContext";

type AuthUser = ReturnType<typeof useAuth>["user"];

/**
 * Shared hub-shell state consumed by child route components.
 *
 * Initiative 0006 Phase 5 — the `RootLayout + Outlet` pattern requires
 * all shared hooks (`useHubNavigation`, `useHubUIState`, `usePwaActions`,
 * keyboard shortcuts, etc.) to live in the parent route (`RootLayout`)
 * so they run once regardless of which child route is active. Child
 * routes (hub page, per-module routes) read the values from this
 * context instead of calling the hooks independently.
 *
 * The context is `null` outside the router tree (tests, Storybook).
 * The `useHubShell()` hook throws if the context is missing — call
 * sites that may run outside the router should use
 * `useOptionalHubShell()` instead.
 */
export interface HubShellValue {
  // Navigation (from useHubNavigation)
  activeModule: HubModuleId | null;
  openModule: HubNavigation["openModule"];
  goToHub: HubNavigation["goToHub"];
  goBackOrHub: HubNavigation["goBackOrHub"];
  goToModuleSettings: HubNavigation["goToModuleSettings"];
  moduleAnimClass: HubNavigation["moduleAnimClass"];

  // UI state (from useHubUIState)
  ui: HubUIState;

  // PWA actions (from usePwaActions)
  pwaAction: PwaAction | null;
  clearPwaAction: () => void;

  // Auth (from useAuth — subset needed by child routes)
  user: AuthUser;
  authLoading: boolean;

  // Modals (from useKeyboardShortcutsModal)
  shortcutsOpen: boolean;
  onCloseShortcuts: () => void;

  // PWA install (from usePwaInstall + useIosInstallBanner)
  canInstall: boolean;
  onInstall: () => Promise<void>;
  onDismissInstall: () => void;
  iosVisible: boolean;
  onDismissIos: () => void;

  // SW update (from useSWUpdate)
  updateAvailable: boolean;
  onApplyUpdate: () => void;

  // Chat overlay (from useHubChatOverlay)
  openAssistantChat: () => void;

  // Auth helpers
  onOpenAuth: () => void;
}

const HubShellContext = createContext<HubShellValue | null>(null);

/**
 * Read hub-shell state. Throws if called outside `<RootLayout />`.
 */
export function useHubShell(): HubShellValue {
  const ctx = useContext(HubShellContext);
  if (!ctx) {
    throw new Error("useHubShell must be used inside <RootLayout />");
  }
  return ctx;
}

/**
 * Read hub-shell state or `null` if outside the router tree.
 * Safe for tests and Storybook.
 */
export function useOptionalHubShell(): HubShellValue | null {
  return useContext(HubShellContext);
}

export function HubShellProvider({
  value,
  children,
}: {
  value: HubShellValue;
  children: ReactNode;
}) {
  return (
    <HubShellContext.Provider value={value}>
      {children}
    </HubShellContext.Provider>
  );
}
