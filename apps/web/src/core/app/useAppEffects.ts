import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";
import { onHubBus } from "@shared/lib/modules/hubBus";
import { HUB_OPEN_MODULE_EVENT } from "@shared/lib/modules/hubNav";
import {
  REQUEST_PULL_EVENT,
  emitCloudPullComplete,
} from "@shared/lib/modules/cloudPullRequest";
import { safeWriteLS } from "@shared/lib/storage/storage";
import { PWA_ACTION_KEY } from "./pwaAction";
import type { PwaAction } from "../hooks/usePwaActions";
import type { HubUIState } from "../hooks/useHubUIState";
import type { HubNavigation } from "../hooks/useHubNavigation";
import type { useCloudSync } from "../cloudSync/useCloudSync";
import type { useAuth } from "../auth/AuthContext";
import { prefetchCriticalModules } from "../lib/useRoutePrefetch";
import { CHAT_PATH } from "./appPaths";

type AuthUser = ReturnType<typeof useAuth>["user"];
type CloudSyncState = ReturnType<typeof useCloudSync>;

export interface AppEffectsDeps {
  user: AuthUser;
  ui: HubUIState;
  sync: CloudSyncState;
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
  const { user, ui, sync, openModule, navigate, setPwaAction, validActions } =
    deps;

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
    return undefined;
  }, [openModule]);

  // Bridge module-level pull-to-refresh gestures to the App-level
  // cloud-sync engine. Modules dispatch `REQUEST_PULL_EVENT` and we run
  // `sync.pullAll()` on their behalf, then emit a completion event so
  // the requesting component can resolve its spinner. See
  // `shared/lib/cloudPullRequest.ts` for the contract.
  useEffect(() => {
    const handler = async () => {
      try {
        await sync.pullAll();
      } catch {
        // Errors are surfaced via `useSyncErrorToast`; the requester
        // only cares that we settled, so swallow here and emit the
        // completion event regardless.
      } finally {
        emitCloudPullComplete();
      }
    };
    window.addEventListener(REQUEST_PULL_EVENT, handler);
    return () => window.removeEventListener(REQUEST_PULL_EVENT, handler);
  }, [sync]);

  // Global signal to open chat from any page (e.g. ProfilePage memory
  // bank, AssistantCataloguePage, hint toasts). Now routes to the
  // dedicated `/chat` route — replaces the previous fullscreen-modal
  // overlay. The `?q=` / `?autoSend=` URL shape is the single source of
  // truth; `HubChatPage` reads those params on mount.
  useEffect(
    () =>
      onHubBus("openChat", (detail) => {
        const params = new URLSearchParams();
        if (detail.message) params.set("q", detail.message);
        if (detail.autoSend) params.set("autoSend", "1");
        const search = params.toString();
        navigate(search ? `${CHAT_PATH}?${search}` : CHAT_PATH);
      }),
    [navigate],
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
}
