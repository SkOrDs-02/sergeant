/// <reference lib="WebWorker" />
/**
 * Service Worker entry point.
 *
 * Initiative 0001 Phase 2 (module decomposition): композиційний root —
 * лише реєструє listener-и і делегує бізнес-логіку у `./sw/*`. Сам файл
 * лишається < 80 LOC, щоб додавання нового handler-а не вимагало
 * прокручувати «warzone» з кешами і таймерами.
 *
 * Layers:
 *   - `./sw/version`      — `SW_VERSION` + `CACHE_NAMES`
 *   - `./sw/cache`        — workbox precache + runtime routes + cache cleanup
 *   - `./sw/notifiedKeys` — IDB-persisted dedup-set (notification keys)
 *   - `./sw/reminders`    — local reminder loop (routine / fizruk / nutrition)
 *   - `./sw/debug`        — debug snapshot + debug-flag accessor
 *   - `./sw/messages`     — `message`-event dispatcher
 */

import { setupCacheRoutes, listStaleCaches } from "./sw/cache";
import { CACHE_NAMES } from "./sw/version";
import { getDebugEnabled } from "./sw/debug";
import { handleSwMessage } from "./sw/messages";
import { recordNotified } from "./sw/notifiedKeys";

declare const self: ServiceWorkerGlobalScope;

setupCacheRoutes();

self.addEventListener("install", (event) => {
  // If a client explicitly asks for it, we can activate immediately.
  if (getDebugEnabled()) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("message", handleSwMessage);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const module = (event.notification.data as { module?: string } | null)
    ?.module;
  const url = module ? `/?module=${module}` : "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope)) {
            client.focus();
            if (module) {
              client.postMessage({ type: "OPEN_MODULE", module });
            }
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});

self.addEventListener("notificationclose", (event) => {
  const tag = event.notification.tag;
  if (tag) recordNotified(tag);
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const stale = await listStaleCaches();
      await Promise.allSettled(stale.map((n) => caches.delete(n)));
      // Old `CACHE_NAMES.navigations` / `.api` entries are filtered out
      // by `listStaleCaches`; the *current* generation is preserved.
      void CACHE_NAMES;
      await self.clients.claim();
    })(),
  );
});

// ── Web Push ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; tag?: string; module?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: event.data.text() };
  }

  const title = payload.title || "Мій простір";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag || `push_${Date.now()}`,
    requireInteraction: false,
    data: { module: payload.module || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
