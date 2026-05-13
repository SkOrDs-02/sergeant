/// <reference types="vite-plugin-pwa/client" />
import { Suspense } from "react";
import { lazyImport } from "./core/lib/lazyImport";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Analytics } from "@vercel/analytics/react";
import { router } from "./core/app/router";
import "./index.css";
import { storageManager } from "@shared/lib/storage/storageManager";
import { createAppQueryClient } from "@shared/lib/api/queryClient";
import { createWebPersistOptions } from "@shared/lib/api/queryClientPersister";
// Registers the web `navigator.vibrate`-based adapter on the shared
// haptic contract (`@sergeant/shared`). Import for side effects only.
import "@shared/lib/adapters/haptic";
// Registers the web Blob + <a download>-based adapter on the shared
// file-download contract (`@sergeant/shared`). Import for side effects only.
import "@shared/lib/adapters/fileDownload";
// Registers the web <input type="file">-based adapter on the shared
// file-import contract (`@sergeant/shared`). Import for side effects only.
import "@shared/lib/adapters/fileImport";
// Registers the web `window.visualViewport`-based adapter on the shared
// visual-keyboard-inset contract (`@sergeant/shared`). Import for side
// effects only.
import "@shared/hooks/useVisualKeyboardInset";
import { ErrorBoundary } from "./core/ErrorBoundary.jsx";
import { installChunkLoadRecover } from "./core/lib/chunkReload.js";
import {
  addSentryBreadcrumb,
  captureException,
  initSentry,
} from "./core/observability/sentry.js";
import { logger } from "@shared/lib";
import { initWebVitals } from "./core/observability/webVitals.js";
import { initPostHog } from "./core/observability/posthog.js";
import { maybeRunOnboarding } from "./core/onboarding/index.js";
import { isCapacitor } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { bootSyncEngineWriter } from "./core/syncEngine/singleton.js";
import { bootstrapKvStore } from "./core/db/kvStoreBoot.js";

const queryClient = createAppQueryClient();
// Persistent IDB-backed snapshot для warm-start: на холодному старті
// PWA / Capacitor-shell `PersistQueryClientProvider` гідрирує
// `QueryCache` з диску до того, як React зможе монтувати `useQuery`,
// тому last-known networth / digest / транзакції видно одразу, а
// background revalidate підтягує свіжі дані. Деталі — у
// `queryClientPersister.ts`.
const persistOptions = createWebPersistOptions();

// react-query devtools are only useful in development. Lazy-importing keeps
// them out of the production bundle entirely — the tree-shaker can drop the
// import expression when `import.meta.env.DEV` is statically `false`.
const ReactQueryDevtools = import.meta.env.DEV
  ? lazyImport(
      () => import("@tanstack/react-query-devtools"),
      "ReactQueryDevtools",
    )
  : null;

// Demo-mode URL trigger: `?demo=1` (alias `?demo=seed`) populates the
// local store with a realistic sample payload across all modules and
// reloads onto `/`. `?demo=reset` wipes it. Called BEFORE storage
// migrations / the legacy demo-cleanup pass so the seeded payload is
// visible to both and survives the boot.
// Stale-bundle recovery: глобальні слухачі `vite:preloadError` /
// `unhandledrejection` / `error`, що роблять одноразовий `location.reload()`
// на `Failed to fetch dynamically imported module`. Має стояти максимально
// рано — щоб упіймати rejection-и на найперших lazy-import-ах.
installChunkLoadRecover();

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="p-8 font-sans">
      <h2 className="text-style-title text-text">
        {messages.errors.generic.somethingWrong}
      </h2>
      <pre className="text-xs text-danger whitespace-pre-wrap mt-2">
        {error?.message}
      </pre>
      <button
        type="button"
        onClick={() => {
          resetError?.();
          window.location.reload();
        }}
        className="mt-4 px-4 py-2 rounded-xl border border-line bg-panel text-style-label text-text"
      >
        {messages.actions.reload}
      </button>
    </div>
  );
}

function shouldRenderVercelAnalytics(): boolean {
  if (typeof window === "undefined") return false;
  return !["localhost", "127.0.0.1", "0.0.0.0"].includes(
    window.location.hostname,
  );
}

// PR #063–#064 boot wiring: kick off SQLite warm-cache, then run the
// storage-dependent boot steps (demo seed, `storageManager` migrations,
// demo cleanup, sync-engine writer boot) and finally mount React. We
// **await** bootstrap before any writes happen so there is no race
// window between the LS-only adapter (pre-bootstrap) and the
// SQLite-backed adapter (post-bootstrap).
//
// `bootstrapKvStore` is documented as never-throwing: every failure
// path (SQLite init, migration runner, scan) leaves
// `kvStoreBoot.loaded = false` and surfaces through `onError`, so the
// IIFE's `try/catch` is belt-and-suspenders against future bugs.
void (async () => {
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  try {
    const result = await bootstrapKvStore({
      onError: (stage, err) => {
        logger.warn(`[main] kvStoreBoot ${stage} failed`, err);
        addSentryBreadcrumb({
          category: "storage",
          level: "warning",
          message: `kvStoreBoot ${stage} failed`,
          data: { error: err instanceof Error ? err.message : String(err) },
        });
      },
    });
    const endedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    addSentryBreadcrumb({
      category: "storage",
      level: "info",
      message: "kvStoreBoot completed",
      data: {
        // Telemetry tags expected by the rollout dashboards. `backend`
        // tells us whether the SQLite cut-over actually took or we are
        // still serving the LS fallback, and `duration_ms` lets us
        // catch boot-time regressions before they reach canary.
        backend: result.loaded ? "sqlite" : "ls-fallback",
        loaded: result.loaded,
        duration_ms: Math.round(endedAt - startedAt),
      },
    });
  } catch (err) {
    addSentryBreadcrumb({
      category: "storage",
      level: "warning",
      message: "kvStoreBoot threw (should be unreachable)",
      data: { error: err instanceof Error ? err.message : String(err) },
    });
    logger.warn("[main] kvStoreBoot threw (should be unreachable)", err);
  }

  void maybeRunOnboarding();
  storageManager.runAll();
  void bootSyncEngineWriter({ captureException });

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <ErrorBoundary fallback={ErrorFallback}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
      >
        <RouterProvider router={router} />
        {shouldRenderVercelAnalytics() ? <Analytics /> : null}
        {ReactQueryDevtools ? (
          <Suspense fallback={null}>
            <ReactQueryDevtools
              initialIsOpen={false}
              buttonPosition="bottom-left"
            />
          </Suspense>
        ) : null}
      </PersistQueryClientProvider>
    </ErrorBoundary>,
  );
})();

// Sentry init + web-vitals збір відкладаємо до після hydration — SDK Sentry
// (~30–40 KB gzip) і `web-vitals` (~1 KB gzip) не повинні блокувати TTI.
// До ініта Sentry `captureException` у локальному ErrorBoundary — no-op.
// Web-vitals слухачі мають бути на місці ДО першого hidden/pagehide, але
// `onLCP`/`onFCP` самі реєструють свої PerformanceObserver якомога раніше
// в межах тіку виклику, тож idle-timeout 2s прийнятний.
const scheduleInit = () => {
  void initSentry();
  void initWebVitals();
  void initPostHog();
};
if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(scheduleInit, { timeout: 2000 });
  } else {
    setTimeout(scheduleInit, 0);
  }
}

// Native-shell bootstrap: лише в Capacitor WebView, ніколи у браузері.
// Dynamic import ⇒ Vite кладе `@sergeant/mobile-shell` та всі `@capacitor/*`
// плагіни в окремий chunk, тож browser-бандл не тягне їх зовсім.
//
// Deep-link bridge підʼєднується НЕ через `options.navigate` (який викликає
// `history.pushState` out-of-component і плутає React Router з «перший render
// уже завершився» сценарієм), а через namespaced `window.__sergeantShellNavigate`,
// який виставляє `<ShellDeepLinkBridge/>` у `core/App.tsx` після маунту
// роутера. Якщо `appUrlOpen` прилітає ДО маунту (cold start через deep link),
// shell буферизує path у `window.__sergeantShellDeepLinkQueue` і bridge
// drain-ить його при install-і.
if (isCapacitor()) {
  import("@sergeant/mobile-shell")
    .then(({ initNativeShell }) => initNativeShell())
    .catch((err) => {
      logger.warn("[main] native-shell init failed", err);
    });
}

// Service worker реєструємо лише у веб-деплої (`apps/web` → Vercel).
// Capacitor WebView ігнорує SW, тож у shell-варіанті (`VITE_TARGET=capacitor`
// + runtime `isCapacitor()`) вся ця гілка мертва і Vite-build її DCE-вирізає:
//   - build-time `import.meta.env.VITE_TARGET !== "capacitor"` падає у `false`
//     після `define`-заміни у `vite.config.js`, тож Rollup не тягне
//     `virtual:pwa-register` (якого у capacitor-білді не існує — плагін
//     `vite-plugin-pwa` там відключений);
//   - runtime `!isCapacitor()` — defensive net на випадок, якщо дефолтний
//     web-бандл раптом завантажиться у Capacitor WebView.
if (
  import.meta.env.VITE_TARGET !== "capacitor" &&
  !isCapacitor() &&
  "serviceWorker" in navigator
) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        window.__pwaUpdateReady = true;
        window.__pwaUpdateSW = updateSW;
        window.dispatchEvent(new CustomEvent("pwa-update-ready"));
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent("pwa-offline-ready"));
      },
    });

    // Opt-in SW debug mode via `?sw=debug` (for support / triage).
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("sw") === "debug") {
        navigator.serviceWorker.ready
          .then((reg) => {
            const ctl = navigator.serviceWorker.controller || reg.active;
            ctl?.postMessage?.({
              type: "SW_SET_DEBUG",
              data: { enabled: true },
            });
          })
          .catch(() => {});
      }
    } catch {
      /* noop */
    }
  });
}
