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

// Audit 2026-05-13 §F8: push payload приходить підписаним VAPID, але
// VAPID-key compromise або mis-routed subscription може підкинути
// довільний `module`. Без allow-list рядок одразу йде у URL і у postMessage.
const ALLOWED_NOTIFICATION_MODULES = new Set([
  "finyk",
  "fizruk",
  "nutrition",
  "routine",
]);

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawModule = (event.notification.data as { module?: string } | null)
    ?.module;
  const module =
    rawModule && ALLOWED_NOTIFICATION_MODULES.has(rawModule)
      ? rawModule
      : undefined;
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
// Audit 2026-05-13 §F9: defensive clamps on adversary-controlled payloads.
// VAPID-signed, але якщо backend скомпрометовано — SW виконає довільний
// `title`/`body`. Обрізаємо довжину і вирізаємо BiDi-overrides
// (U+202A..U+202E, U+2066..U+2069) і zero-width joiners (U+200B..U+200D,
// U+FEFF), які зловмисник може використати для візуального спуфінгу.
const sanitize = (input: unknown, max: number): string =>
  String(input ?? "")
    .replace(/[‪-‮⁦-⁩​-‍﻿]/g, "")
    .slice(0, max);

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; tag?: string; module?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: event.data.text() };
  }

  const title = sanitize(payload.title, 80) || "Мій простір";
  const tag = sanitize(payload.tag, 120) || `push_${Date.now()}`;
  const options = {
    body: sanitize(payload.body, 200),
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag,
    requireInteraction: false,
    data: { module: payload.module || null },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
