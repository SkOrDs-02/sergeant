import type { ReactNode } from "react";
import { ScrollRestoration } from "react-router-dom";
import { ApiClientProvider } from "@sergeant/api-client/react";
import { apiClient } from "@shared/api";
import { ToastProvider } from "@shared/hooks/useToast";
import { ToastContainer } from "@shared/components/ui/Toast";
import { ScreenReaderAnnouncerProvider } from "@shared/components/ui/ScreenReaderAnnouncer";
import { ShortcutRegistryProvider } from "@shared/components/ui/KeyboardShortcutsModal";
import {
  CommandPalette,
  CommandPaletteProvider,
} from "@shared/components/ui/CommandPalette";

import { AuthProvider } from "../auth/AuthContext";
import { AppLockProvider } from "../security/AppLockContext";
import { HashRedirect } from "./HashRedirect";
import { PageviewTracker } from "../observability/PageviewTracker";
import { ShellDeepLinkBridge } from "./ShellDeepLinkBridge";

/**
 * Single, well-defined provider stack for `apps/web`.
 *
 * Web-deep-dive 2026-05-03 §1.1 flagged the provider tree in `App.tsx`
 * as a fragile imperative ladder — siblings (`ToastContainer`, the
 * router-effect bridges) were interleaved with providers, the ordering
 * invariants were implicit, and there was no test that the deepest
 * descendant could read every context. This component is the explicit
 * answer: it owns the entire ladder so `App.tsx` can collapse to a
 * `<Providers><AppShell /></Providers>` single-line render and the
 * invariant is exercised by `App.test.tsx`.
 *
 * Order matters — keep these phases in sync with the docstrings:
 *
 *  1. **Bootstrap UI infra** (no I/O): `ShortcutRegistryProvider`,
 *     `ToastProvider`, `ToastContainer` sibling, `ScreenReaderAnnouncerProvider`.
 *     Toast + announcer must live above auth so unauthenticated screens
 *     (sign-in, onboarding, reset-password) can still surface toasts
 *     and announce dynamic state changes to assistive tech.
 *  2. **Router effects** — `ShellDeepLinkBridge` (Capacitor deep links),
 *     `HashRedirect` (legacy `/#fizruk/...` → `/fizruk/...` shim — see
 *     `docs/initiatives/0006-frontend-routing-and-code-split.md` §Phase 3),
 *     `ScrollRestoration` (Phase 4), `PageviewTracker` (PostHog `$pageview`).
 *     Mounted **inside** the toast tree so they can fire toasts on bridge
 *     errors / scroll-restore-fallback warnings, but **outside** the auth
 *     tree so pageviews + deep links survive `/sign-in`, `/welcome`, …
 *  3. **Data providers** (I/O): `ApiClientProvider`, `AuthProvider`,
 *     `AppLockProvider` — anything that fetches or owns session state.
 *
 * **No siblings ever leak between phases.** If a future provider needs
 * to read toasts but be outside auth (phase 2-ish), it goes here, not
 * in `App.tsx`. The invariant test in `App.test.tsx` guards the contract.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ShortcutRegistryProvider>
      <ToastProvider>
        <ToastContainer />
        <ShellDeepLinkBridge />
        <HashRedirect />
        <ScrollRestoration />
        <PageviewTracker />
        <ScreenReaderAnnouncerProvider>
          <ApiClientProvider client={apiClient}>
            <AuthProvider>
              <AppLockProvider>
                <CommandPaletteProvider>
                  {/* Track 5 — global ⌘K palette. The portal-mounted UI
                      lives next to the provider so any module that calls
                      `useRegisterCommand` can also see the rendered
                      surface without an additional mount point. */}
                  <CommandPalette />
                  {children}
                </CommandPaletteProvider>
              </AppLockProvider>
            </AuthProvider>
          </ApiClientProvider>
        </ScreenReaderAnnouncerProvider>
      </ToastProvider>
    </ShortcutRegistryProvider>
  );
}
