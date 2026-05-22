import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { onHubBus } from "@shared/lib/modules/hubBus";
import {
  HUB_OPEN_MODULE_EVENT,
  HUB_OPEN_SETTINGS_EVENT,
} from "@shared/lib/modules/hubNav";
import {
  REQUEST_PULL_EVENT,
  emitCloudPullComplete,
} from "@shared/lib/modules/cloudPullRequest";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { PWA_ACTION_KEY } from "./pwaAction";
import type { PwaAction } from "../hooks/usePwaActions";
import type { HubUIState } from "../hooks/useHubUIState";
import type { HubNavigation } from "../hooks/useHubNavigation";
import type { useAuth } from "../auth/AuthContext";
import {
  prefetchCriticalModules,
  prefetchHubNavigationPages,
} from "../lib/useRoutePrefetch";
import { useHubChatOverlay } from "../hub/useHubChatOverlay";

type AuthUser = ReturnType<typeof useAuth>["user"];

export interface AppEffectsDeps {
  user: AuthUser;
  authLoading: boolean;
  ui: HubUIState;
  openModule: HubNavigation["openModule"];
  navigate: NavigateFunction;
  setPwaAction: (value: PwaAction | null) => void;
  validActions: Set<PwaAction>;
}

// All AppInner-level side effects that bridge global signals (idle
// prefetch, SW messages, cloud-sync requests, hub bus, hub open-module
// CustomEvent) into the React tree. Grouped into a single hook so
// `App.tsx` stays a thin composition shell.
export function useAppEffects(deps: AppEffectsDeps): void {
  const {
    user,
    authLoading,
    ui,
    openModule,
    navigate,
    setPwaAction,
    validActions,
  } = deps;
  const { hubView, setHubView } = ui;
  const { openChat } = useHubChatOverlay();

  // Prefetch hub-navigation pages first, then let heavier module chunks
  // follow on a later idle slot. Reports and Settings are primary tabs,
  // so they should not sit behind four module prefetches on cold start.
  // Previously hard-coded to `setTimeout(2000)`, which over-paid on fast
  // devices (idle by 200 ms) and under-paid on slow ones (still hydrating
  // at 2 s). `requestIdleCallback` lets the browser fire whenever the
  // initial-render burst is genuinely done; the 4 s `timeout` cap stops
  // a permanently-busy main thread from starving the prefetch entirely.
  // Safari ≤ 16 has no `requestIdleCallback`, so we keep the original
  // 2 s fallback for it.
  useEffect(() => {
    // Hub navigation pages (Reports + Settings) are primary tabs. Kick
    // their chunks off immediately so a tap on the bottom-nav lands on
    // a hydrated component instead of the Suspense skeleton. The inner
    // `prefetchHubNavigationPages` still wraps each import in
    // `requestIdleCallback` (with its own 3 s timeout), so this stays
    // non-blocking — we just drop the outer idle wrap that was stacking
    // on top and pushing first-touch latency past the user's tap.
    prefetchHubNavigationPages();
    if ("requestIdleCallback" in window) {
      const moduleId = requestIdleCallback(
        () => {
          prefetchCriticalModules();
        },
        { timeout: 6000 },
      );
      return () => {
        cancelIdleCallback(moduleId);
      };
    }
    const moduleTimer = setTimeout(() => {
      prefetchCriticalModules();
    }, 3000);
    return () => {
      clearTimeout(moduleTimer);
    };
  }, []);

  // If the user signs out while the «Профіль» tab is active, bounce the
  // hub back to the dashboard — the tab itself disappears from the
  // bottom nav (gated on `user`), and without this the main content
  // area would render nothing for the `profile` view.
  //
  // BUG FIX (#2935 follow-up): we MUST wait for `authLoading` to settle
  // before bouncing. Otherwise a deep-link / refresh on `/?tab=profile`
  // hits cold-start with `user === null` (because `meQuery` hasn't
  // resolved yet) and the effect fires immediately — flipping the URL
  // back to `/` and rendering the dashboard while the user is in fact
  // signed in. Reported symptom: «сторінка профіль не перемикається».
  // Also: depend on `hubView` + `setHubView` directly, not the entire
  // `ui` object — `useHubUIState` returns a fresh object every render,
  // so `[user, ui]` re-runs the effect on every parent render and
  // amplifies the race.
  useEffect(() => {
    if (authLoading) return;
    if (!user && hubView === "profile") {
      setHubView("dashboard");
    }
  }, [authLoading, user, hubView, setHubView]);

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
    return undefined;
  }, [openModule]);

  // Legacy module-level pull-to-refresh gestures used to call CloudSync
  // v1 pullAll. v1 is gone; settle the historical event so older module
  // refresh controls do not hang while they migrate to v2-aware refresh.
  useEffect(() => {
    const handler = () => {
      emitCloudPullComplete();
    };
    window.addEventListener(REQUEST_PULL_EVENT, handler);
    return () => window.removeEventListener(REQUEST_PULL_EVENT, handler);
  }, []);

  // Global signal to open chat from any page (e.g. ProfilePage memory
  // bank, AssistantCataloguePage, hint toasts). Sergeant v2 Phase 7 D5:
  // open the in-memory bottom-sheet overlay rather than navigating to
  // `/chat` — keeps the user's current route (and scroll position) so
  // "ask AI about this expense" surfaces don't tear down the surface
  // beneath. Deep links (notifications, AIPill voice commit) still hit
  // the full-screen `/chat` route via `HubChatPage`, which is mounted
  // by `StandaloneRoutes.tsx` and reads `?q=` / `?autoSend=1` directly.
  useEffect(
    () =>
      onHubBus("openChat", (detail) => {
        openChat({
          initialMessage: detail.message ?? "",
          autoSend: detail.autoSend ?? false,
        });
      }),
    [openChat],
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

  // Cross-cutting signal: switch to the Settings tab and (optionally)
  // scroll to a named section. Used by surfaces that need to send the
  // user to Hub Settings without prop-drilling react-router through the
  // tree — most notably the inactive-module Bento card whose tap should
  // open Hub Settings → Дашборд → "Модулі дашборду" instead of the
  // (disabled) module itself.
  const setHubViewStable = ui.setHubView;
  useEffect(() => {
    const onSettingsOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ section?: string }>).detail || {};
      const section = (detail.section ?? "").trim();
      // Always flip the in-memory tab state immediately so the Settings
      // tabpanel mounts even before the URL change is observed via
      // `useLocation().search` — keeps the redirect feeling instant.
      setHubViewStable("settings");
      const target = section
        ? `/?tab=settings#settings-${section}`
        : `/?tab=settings`;
      navigate(target);
    };
    window.addEventListener(HUB_OPEN_SETTINGS_EVENT, onSettingsOpen);
    return () =>
      window.removeEventListener(HUB_OPEN_SETTINGS_EVENT, onSettingsOpen);
  }, [navigate, setHubViewStable]);
}
