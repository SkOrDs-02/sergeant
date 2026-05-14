/**
 * SW prompt-mode auto-update controller — stack-pulse 2026-05 / PR-21.
 *
 * Layered strategy (in addition to the existing manual prompt-toast):
 *
 *   1. **Periodic update-check** — every `updateIntervalMs` (30 min default)
 *      we call `registration.update()` so a deployed-but-not-yet-observed SW
 *      transitions into `waiting` even if the user never navigates. The
 *      existing `vite-plugin-pwa` `registerSW({ onNeedRefresh })` wiring
 *      (in `main.tsx`) then dispatches the `pwa-update-ready` custom event
 *      and the `useSWUpdate` toast appears as usual.
 *
 *   2. **Idle auto-skipWaiting** — when the tab becomes visible after
 *      sitting in the background for more than `idleSkipWaitingMs`
 *      (5 min default) AND a `waiting` SW exists, we silently apply the
 *      update via `updateSW(true)`. The user was AFK, so we trade
 *      "subtle reload" for "no stale UI when they come back".
 *
 *   3. **Build-id hard-floor** — `serverBuildIdMiddleware` stamps every
 *      API response with `X-Server-Build-Id`. The `@shared/api` client
 *      pipes header observations into {@link reportServerBuildId}; if
 *      the server build differs from `import.meta.env.VITE_BUILD_ID`
 *      for longer than `buildIdMismatchPromptMs` (1 h default), we
 *      force the prompt even when the SW pipeline thinks nothing is
 *      waiting (e.g. mid-deploy where a stale client talks to a new
 *      server but the new SW hasn't been served yet).
 *
 * The module is deliberately framework-agnostic — all DOM globals can
 * be overridden via options so the test suite can drive a fake clock /
 * fake `navigator.serviceWorker` without touching JSDOM internals.
 */

declare global {
  interface Window {
    __pwaUpdateSW?: (reloadPage?: boolean) => void;
    __pwaUpdateReady?: boolean;
  }
  interface Navigator {
    connection?: { saveData?: boolean };
  }
}

export interface AutoUpdateOptions {
  /** Period for `registration.update()` polling. Default: 30 minutes. */
  updateIntervalMs?: number;
  /**
   * Minimum hidden duration before a visibility-change triggers
   * skip-waiting on a `waiting` SW. Default: 5 minutes.
   */
  idleSkipWaitingMs?: number;
  /**
   * Minimum duration a `client_build_id !== server_build_id`
   * mismatch must persist before we force the update prompt.
   * Default: 1 hour.
   */
  buildIdMismatchPromptMs?: number;
  /** Client build id. Default: `import.meta.env.VITE_BUILD_ID || "dev"`. */
  clientBuildId?: string;
  /**
   * Callback returned by `registerSW({...})` from `virtual:pwa-register`.
   * Called with `true` to skip-waiting + reload immediately. If omitted,
   * we fall back to `window.__pwaUpdateSW` (the global registered by
   * `main.tsx` at boot), and if that is missing we trigger a vanilla
   * `location.reload()`.
   */
  updateSW?: (reloadPage?: boolean) => void | Promise<void>;
  /** Override `window` (tests). */
  windowRef?: Window;
  /** Override `document` (tests). */
  documentRef?: Document;
  /** Override `navigator` (tests). */
  navigatorRef?: Navigator;
  /** Override `setInterval` (tests). */
  setIntervalFn?: typeof setInterval;
  /** Override `clearInterval` (tests). */
  clearIntervalFn?: typeof clearInterval;
  /** Override `setTimeout` (tests). */
  setTimeoutFn?: typeof setTimeout;
  /** Override `clearTimeout` (tests). */
  clearTimeoutFn?: typeof clearTimeout;
  /** Monotonic clock for tests. Default: `Date.now`. */
  now?: () => number;
  /** Optional sink for debug logs. */
  onDebug?: (msg: string, data?: Record<string, unknown>) => void;
}

export interface AutoUpdateController {
  /** Stop intervals and detach listeners. Safe to call multiple times. */
  dispose(): void;
  /**
   * Manually feed a server `X-Server-Build-Id` value. Called by the
   * api-client `onResponseHeaders` hook on every API response.
   */
  reportServerBuildId(buildId: string | null | undefined): void;
}

const DEFAULT_UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_IDLE_SKIP_WAITING_MS = 5 * 60 * 1000;
const DEFAULT_BUILD_ID_MISMATCH_MS = 60 * 60 * 1000;

const NOOP_DISPOSE: AutoUpdateController = {
  dispose: () => undefined,
  reportServerBuildId: () => undefined,
};

function resolveClientBuildId(explicit?: string): string {
  if (typeof explicit === "string" && explicit.trim() !== "") {
    return explicit.trim();
  }
  const fromEnv = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? "";
  return fromEnv.trim() !== "" ? fromEnv.trim() : "dev";
}

function getRegistration(
  navigator: Navigator,
): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(undefined);
  return navigator.serviceWorker.getRegistration();
}

/**
 * Wires periodic update polling, idle-skip-waiting, and build-id
 * mismatch tracking. Returns a controller exposing `dispose()` (used
 * by HMR / unmount) and `reportServerBuildId()` (used by the
 * api-client interceptor).
 *
 * No-ops gracefully when the host environment doesn't support service
 * workers (`navigator.serviceWorker` undefined) — that covers the
 * Capacitor-shell + JSDOM-without-SW test paths.
 */
export function setupAutoUpdate(
  opts: AutoUpdateOptions = {},
): AutoUpdateController {
  const win: Window | undefined = opts.windowRef ?? globalThis.window;
  if (!win) return NOOP_DISPOSE;
  const doc: Document = opts.documentRef ?? win.document;
  const nav: Navigator = opts.navigatorRef ?? win.navigator;
  if (!("serviceWorker" in nav)) return NOOP_DISPOSE;

  const updateIntervalMs = opts.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
  const idleSkipWaitingMs =
    opts.idleSkipWaitingMs ?? DEFAULT_IDLE_SKIP_WAITING_MS;
  const buildIdMismatchPromptMs =
    opts.buildIdMismatchPromptMs ?? DEFAULT_BUILD_ID_MISMATCH_MS;
  const clientBuildId = resolveClientBuildId(opts.clientBuildId);
  const now = opts.now ?? Date.now;
  const setIntervalFn = opts.setIntervalFn ?? setInterval;
  const clearIntervalFn = opts.clearIntervalFn ?? clearInterval;
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout;
  const onDebug = opts.onDebug;

  const debug = (msg: string, data?: Record<string, unknown>) => {
    try {
      onDebug?.(msg, data);
    } catch {
      // Debug sink errors must never leak.
    }
  };

  const triggerUpdate = (reloadPage: boolean) => {
    const fn =
      opts.updateSW ??
      (win.__pwaUpdateSW as ((reloadPage?: boolean) => void) | undefined);
    if (typeof fn === "function") {
      try {
        const r = fn(reloadPage);
        // updateSW may return a Promise; we don't await — fire-and-forget.
        void r;
      } catch (err) {
        debug("triggerUpdate threw", {
          error: err instanceof Error ? err.message : String(err),
        });
        if (reloadPage) win.location.reload();
      }
    } else if (reloadPage) {
      win.location.reload();
    }
  };

  const dispatchUpdateReady = () => {
    if (win.__pwaUpdateReady) return;
    win.__pwaUpdateReady = true;
    try {
      win.dispatchEvent(new CustomEvent("pwa-update-ready"));
    } catch (err) {
      debug("dispatch pwa-update-ready failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // --- 1. Periodic update polling -------------------------------------
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  const tickUpdate = async () => {
    if (nav.connection?.saveData) {
      debug("periodic update skipped (saveData)");
      return;
    }
    try {
      const reg = await getRegistration(nav);
      if (reg) await reg.update();
    } catch (err) {
      debug("registration.update() failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  if (updateIntervalMs > 0) {
    intervalHandle = setIntervalFn(() => {
      void tickUpdate();
    }, updateIntervalMs);
  }

  // --- 2. Idle skip-waiting on visibility change ----------------------
  let hiddenSince: number | null =
    doc.visibilityState === "hidden" ? now() : null;
  const onVisibilityChange = async () => {
    if (doc.visibilityState === "hidden") {
      hiddenSince = now();
      return;
    }
    // visibilityState === "visible"
    const startedHiddenAt = hiddenSince;
    hiddenSince = null;
    if (startedHiddenAt == null) return;
    const hiddenDurationMs = now() - startedHiddenAt;
    if (hiddenDurationMs < idleSkipWaitingMs) return;
    try {
      const reg = await getRegistration(nav);
      if (!reg?.waiting) return;
      debug("auto-skipWaiting on visibility", {
        hiddenDurationMs,
        idleSkipWaitingMs,
      });
      triggerUpdate(true);
    } catch (err) {
      debug("visibilitychange handler failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };
  doc.addEventListener("visibilitychange", onVisibilityChange);

  // --- 3. Build-id mismatch hard-floor --------------------------------
  let mismatchSince: number | null = null;
  let mismatchTimer: ReturnType<typeof setTimeout> | null = null;
  let firedForBuildId: string | null = null;
  const cancelMismatchTimer = () => {
    if (mismatchTimer != null) {
      clearTimeoutFn(mismatchTimer);
      mismatchTimer = null;
    }
  };
  const fireBuildIdMismatch = (serverBuildId: string) => {
    if (firedForBuildId === serverBuildId) return;
    firedForBuildId = serverBuildId;
    debug("build-id mismatch prompt fired", {
      clientBuildId,
      serverBuildId,
      buildIdMismatchPromptMs,
    });
    dispatchUpdateReady();
  };
  const reportServerBuildId = (raw: string | null | undefined) => {
    if (typeof raw !== "string") return;
    const serverBuildId = raw.trim();
    if (serverBuildId === "") return;
    // Server has caught up — clear any pending mismatch state. Also
    // resets the "we already fired" guard so a future divergence
    // re-arms the timer.
    if (serverBuildId === clientBuildId) {
      mismatchSince = null;
      cancelMismatchTimer();
      firedForBuildId = null;
      return;
    }
    if (firedForBuildId === serverBuildId) return; // Already prompted.
    if (mismatchSince == null) {
      mismatchSince = now();
      const elapsed = 0;
      const remaining = Math.max(0, buildIdMismatchPromptMs - elapsed);
      cancelMismatchTimer();
      mismatchTimer = setTimeoutFn(() => {
        mismatchTimer = null;
        fireBuildIdMismatch(serverBuildId);
      }, remaining);
      debug("build-id mismatch observed", {
        clientBuildId,
        serverBuildId,
        graceMs: remaining,
      });
      return;
    }
    const elapsed = now() - mismatchSince;
    if (elapsed >= buildIdMismatchPromptMs) {
      fireBuildIdMismatch(serverBuildId);
    }
  };

  // Kick off one immediate check — covers the cold-start case where
  // the SW was installed during a prior session but `update()` hasn't
  // been called yet on this page load.
  void tickUpdate();

  return {
    dispose: () => {
      if (intervalHandle != null) clearIntervalFn(intervalHandle);
      intervalHandle = null;
      cancelMismatchTimer();
      doc.removeEventListener("visibilitychange", onVisibilityChange);
    },
    reportServerBuildId,
  };
}
