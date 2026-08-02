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
import { handleSwMessage } from "./sw/messages";
import { recordNotified } from "./sw/notifiedKeys";
import {
  ALLOWED_NOTIFICATION_MODULES,
  normalizePushPayload,
  safeNotificationPath,
  type SwPushPayload,
} from "./sw/pushPayload";

declare const self: ServiceWorkerGlobalScope;

setupCacheRoutes();

self.addEventListener("install", (event) => {
  // Activate the freshly installed SW immediately. Without this, the
  // previous SW keeps controlling open tabs / standalone PWA sessions
  // and continues to serve stale precached chunks indefinitely (на iOS
  // PWA «закриття» не вбиває worker — тому стара версія може жити
  // тижнями). `clients.claim()` у `activate` потім забирає контроль над
  // усіма вкладками, а `controllerchange` у `main.tsx` робить один
  // hard-reload, щоб JS-граф у пам'яті синхронізувався з новим
  // precache-манифестом.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("message", handleSwMessage);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as {
    module?: string;
    url?: string;
  } | null;
  // `module` уже звужений allow-list-ом у `normalizePushPayload` перед
  // записом у `data`, але локальні нагадування (`sw/reminders.ts`) кладуть
  // його напряму, тож перевіряємо ще раз тут.
  const rawModule = data?.module;
  const module =
    rawModule && ALLOWED_NOTIFICATION_MODULES.has(rawModule)
      ? rawModule
      : undefined;
  // Явний deep-link перемагає модульний fallback: `data.url` вказує на
  // конкретний екран (`/finyk/budgets`), тоді як `?module=` доводить лише
  // до кореня модуля. Сервер шле `url` у кожному payload-і з `PushPayload.url`
  // (`push/send.ts` кладе його саме в `data.url`), і до цієї правки SW його
  // ігнорував — deep-link не працював у жодному пуші.
  const deepLink = safeNotificationPath(data?.url);
  const url = deepLink ?? (module ? `/?module=${module}` : "/");
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope)) {
            client.focus();
            if (deepLink && "navigate" in client) {
              // Вкладка вже відкрита — ведемо її на цільовий екран. `navigate`
              // може відхилитись (крос-origin, вкладка втратила контроль);
              // тоді лишається сфокусована вкладка + postMessage нижче.
              void client.navigate(deepLink).catch(() => {
                if (module) client.postMessage({ type: "OPEN_MODULE", module });
              });
              return;
            }
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
// Розбір і захисні обрізки payload-у живуть у `./sw/pushPayload` — там же
// зафіксована історія розбіжності контракту між сервером і цим handler-ом
// (плаский `module`/`tag` проти вкладеного `data`), і там її покривають
// тести, яких сам сервіс-воркер мати не може.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let raw: SwPushPayload;
  try {
    raw = event.data.json();
  } catch {
    raw = { title: event.data.text() };
  }

  const push = normalizePushPayload(raw, `push_${Date.now()}`);
  const options = {
    body: push.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: push.tag,
    requireInteraction: false,
    // `url` доїжджає до `notificationclick` тільки через `data` — інших
    // каналів між двома подіями немає.
    data: { module: push.module, url: push.url },
  };

  event.waitUntil(self.registration.showNotification(push.title, options));
});
