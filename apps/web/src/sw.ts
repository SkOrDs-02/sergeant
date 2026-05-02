/// <reference lib="WebWorker" />

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
declare const __SW_BUILD_ID__: string;

// Replaced at build time via `apps/web/vite.config.js#define`.
// Falls back to "dev" if the bundler didn't inject the constant.
const SW_VERSION =
  (typeof __SW_BUILD_ID__ !== "undefined" && __SW_BUILD_ID__) || "dev";

const CACHE_NAMES = {
  navigations: `navigations-v${SW_VERSION}`,
  api: `api-cache-v${SW_VERSION}`,
};

let debugEnabled = false;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: CACHE_NAMES.navigations,
      networkTimeoutSeconds: 3,
      plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
    { denylist: [/^\/api\//] },
  ),
);

// GET /api/* — NetworkFirst with a short timeout so the cache only kicks in
// when the network is actually unreachable or very slow. Non-GET requests
// (POST/PUT/DELETE) are NOT cached; they continue to go through the in-JS
// offline queue implemented in useCloudSync.js.
// Auth endpoints (`/api/auth/*`) are explicitly excluded: serving a stale
// cached session could make the app believe a user is still authenticated
// after logout or session expiry.
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/api/auth/") &&
    // Volatile endpoints: caching these tends to create "ghost state"
    // after deploys / logins / sync retries.
    !url.pathname.startsWith("/api/sync/") &&
    !url.pathname.startsWith("/api/coach") &&
    !url.pathname.startsWith("/api/weekly-digest") &&
    request.method === "GET",
  new NetworkFirst({
    cacheName: CACHE_NAMES.api,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        // Keep it short: the API is largely user-specific and can change
        // quickly. This cache is meant to help in brief offline windows,
        // not to serve old state for days.
        maxAgeSeconds: 60 * 30, // 30 min
        purgeOnQuotaError: true,
      }),
    ],
  }),
  "GET",
);

const ROUTINE_NOTIFY_PREFIX = "routine_notify_";

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function currentHm() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

type SwRoutineHabit = {
  id: string;
  name: string;
  emoji?: string;
  archived?: boolean;
  recurrence?: string;
  startDate?: string;
  endDate?: string | null;
  weekdays?: number[];
  reminderTimes?: unknown[];
  timeOfDay?: string;
};

type SwRoutineState = {
  prefs?: { routineRemindersEnabled?: boolean };
  habits?: SwRoutineHabit[];
  completions?: Record<string, string[]>;
};

type SwFizrukState = {
  reminderEnabled?: boolean;
  reminderHour?: number;
  reminderMinute?: number;
  days?: Record<string, { templateId?: string } | undefined>;
};

type SwNutritionState = {
  reminderEnabled?: boolean;
  reminderHour?: number;
};

function habitScheduledOnDateSW(h: SwRoutineHabit, dk: string) {
  if (!h || h.archived) return false;
  if (h.startDate && dk < h.startDate) return false;
  if (h.endDate && dk > h.endDate) return false;
  const rec = h.recurrence || "daily";
  if (rec === "daily") return true;
  if (rec === "once") return dk === h.startDate;
  if (rec === "weekly") {
    const d = new Date(dk + "T12:00:00");
    const wd = (d.getDay() + 6) % 7;
    return Array.isArray(h.weekdays) && h.weekdays.includes(wd);
  }
  if (rec === "monthly") {
    const startDay = h.startDate ? parseInt(h.startDate.split("-")[2], 10) : 1;
    const dkDay = parseInt(dk.split("-")[2], 10);
    const [y, m] = dk.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return startDay > lastDay ? dkDay === lastDay : dkDay === startDay;
  }
  return true;
}

const notifiedKeys = new Set<string>();
let lastPrunedDk: string | null = null;
let routineData: SwRoutineState | null = null;
let fizrukData: SwFizrukState | null = null;
let nutritionData: SwNutritionState | null = null;
let scheduledTimerId: ReturnType<typeof setTimeout> | null = null;

// Persist `notifiedKeys` in IndexedDB so the dedup Set survives the SW
// lifecycle. Browsers typically terminate an idle SW after ~30 s; the
// next reminder tick starts a fresh worker and, without persistence,
// we would re-fire the same-minute notification because the in-memory
// Set is empty again. All IDB operations are best-effort — if IDB
// isn't available we silently fall back to in-memory-only dedup.
const IDB_NAME = "sergeant-sw";
const IDB_STORE = "notified-keys";

function openNotifiedDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(IDB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("idb blocked"));
  });
}

async function idbLoadAllKeys() {
  const db = (await openNotifiedDb()) as IDBDatabase;
  try {
    return await new Promise<IDBValidKey[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPutKey(key: string) {
  const db = (await openNotifiedDb()) as IDBDatabase;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(1, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function idbDeleteKeys(keys: string[]) {
  if (!keys.length) return;
  const db = (await openNotifiedDb()) as IDBDatabase;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      for (const k of keys) store.delete(k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

let notifiedKeysLoadPromise: Promise<void> | null = null;
function loadNotifiedKeys(): Promise<void> {
  if (notifiedKeysLoadPromise) return notifiedKeysLoadPromise;
  notifiedKeysLoadPromise = (async () => {
    try {
      const keys = await idbLoadAllKeys();
      for (const k of keys) {
        if (typeof k === "string") notifiedKeys.add(k);
      }
    } catch {
      /* IDB unavailable — in-memory dedup still works for the
         current SW lifetime. */
    }
  })();
  return notifiedKeysLoadPromise;
}

function recordNotified(key: string) {
  if (!key) return;
  notifiedKeys.add(key);
  idbPutKey(key).catch(() => {
    /* best-effort persistence */
  });
}

/**
 * Drop dedupe keys tied to past days so the Set does not grow without bound
 * across the SW lifetime. All keys end with a `YYYY-MM-DD` suffix (see the
 * three `*_notify_*_<dk>` emit sites above), so we keep only entries ending
 * in the current `dk`.
 */
function pruneOldNotifiedKeys(currentDk: string) {
  if (lastPrunedDk === currentDk) return;
  lastPrunedDk = currentDk;
  const suffix = `_${currentDk}`;
  const toDelete: string[] = [];
  for (const k of notifiedKeys) {
    if (!k.endsWith(suffix)) {
      notifiedKeys.delete(k);
      toDelete.push(k);
    }
  }
  if (toDelete.length) {
    idbDeleteKeys(toDelete).catch(() => {
      /* best-effort */
    });
  }
}

function normalizeReminderTimesSW(h: SwRoutineHabit): string[] {
  if (Array.isArray(h.reminderTimes) && h.reminderTimes.length > 0) {
    return h.reminderTimes.filter(
      (t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t),
    );
  }
  const legacy = h.timeOfDay && String(h.timeOfDay).trim();
  if (legacy && /^\d{2}:\d{2}$/.test(legacy)) return [legacy];
  return [];
}

function checkRoutineReminders() {
  if (!routineData) return;
  if (routineData.prefs?.routineRemindersEnabled !== true) return;

  const dk = todayKey();
  const hm = currentHm();
  const habits = routineData.habits || [];
  const completions = routineData.completions || {};

  for (const h of habits) {
    if (h.archived) continue;
    const times = normalizeReminderTimesSW(h);
    if (times.length === 0) continue;
    if (!times.includes(hm)) continue;
    if (!habitScheduledOnDateSW(h, dk)) continue;
    const hCompletions = completions[h.id] || [];
    if (hCompletions.includes(dk)) continue;

    const storageKey = `${ROUTINE_NOTIFY_PREFIX}${h.id}_${hm}_${dk}`;
    if (notifiedKeys.has(storageKey)) continue;
    recordNotified(storageKey);

    const title = `${h.emoji || "✓"} ${h.name}`;
    self.registration
      .showNotification(title, {
        body: "Нагадування про звичку",
        tag: storageKey,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        requireInteraction: false,
        data: { action: "open", module: "routine" },
      })
      .catch(() => {});
  }
}

function checkFizrukReminders() {
  if (!fizrukData) return;
  if (!fizrukData.reminderEnabled) return;

  const dk = todayKey();
  const hm = currentHm();
  const todayEntry = fizrukData.days?.[dk];
  if (!todayEntry?.templateId) return;

  const rh = Number.isFinite(fizrukData.reminderHour)
    ? fizrukData.reminderHour
    : 18;
  const rm = Number.isFinite(fizrukData.reminderMinute)
    ? fizrukData.reminderMinute
    : 0;
  const targetHm = `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
  if (hm !== targetHm) return;

  const storageKey = `fizruk_notify_${dk}`;
  if (notifiedKeys.has(storageKey)) return;
  recordNotified(storageKey);

  self.registration
    .showNotification("🏋️ Фізрук — тренування", {
      body: "Заплановане тренування на сьогодні. Відкрий застосунок, щоб стартувати.",
      tag: storageKey,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: false,
      data: { action: "open", module: "fizruk" },
    })
    .catch(() => {});
}

function checkNutritionReminders() {
  if (!nutritionData) return;
  if (!nutritionData.reminderEnabled) return;

  const dk = todayKey();
  const hm = currentHm();
  const rh = Number.isFinite(nutritionData.reminderHour)
    ? nutritionData.reminderHour
    : 12;
  const targetHm = `${String(rh).padStart(2, "0")}:00`;
  if (hm !== targetHm) return;

  const storageKey = `nutrition_notify_${dk}`;
  if (notifiedKeys.has(storageKey)) return;
  recordNotified(storageKey);

  self.registration
    .showNotification("🥗 Харчування", {
      body: "Час відмітити прийом їжі! Відкрий застосунок.",
      tag: storageKey,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: false,
      data: { action: "open", module: "nutrition" },
    })
    .catch(() => {});
}

function checkReminders() {
  pruneOldNotifiedKeys(todayKey());
  checkRoutineReminders();
  checkFizrukReminders();
  checkNutritionReminders();
}

function scheduleNextCheck() {
  if (scheduledTimerId) clearTimeout(scheduledTimerId);
  const now = new Date();
  const msToNextMinute =
    (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
  scheduledTimerId = setTimeout(() => {
    checkReminders();
    scheduleNextCheck();
  }, msToNextMinute);
}

function startReminderLoop() {
  // Make sure we have replayed any persisted dedup keys from a previous
  // SW generation before the first check runs, so we don't re-fire the
  // current-minute notification on cold start.
  loadNotifiedKeys()
    .then(() => {
      checkReminders();
      scheduleNextCheck();
    })
    .catch(() => {
      checkReminders();
      scheduleNextCheck();
    });
}

async function cacheEntryCount(cacheName: string) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return null;
  }
}

async function buildSwSnapshot() {
  const cacheNames = await caches.keys();
  const workboxCaches = cacheNames.filter((n) => n.startsWith("workbox-"));
  const counts: Record<string, number | null> = {};
  for (const n of [CACHE_NAMES.navigations, CACHE_NAMES.api]) {
    counts[n] = await cacheEntryCount(n);
  }
  for (const n of workboxCaches.slice(0, 5)) {
    // Best-effort: don't scan unbounded.
    if (counts[n] == null) counts[n] = await cacheEntryCount(n);
  }

  let notifiedKeyCount = null;
  try {
    await loadNotifiedKeys();
    notifiedKeyCount = notifiedKeys.size;
  } catch {
    notifiedKeyCount = null;
  }

  return {
    ok: true,
    version: SW_VERSION,
    debugEnabled,
    caches: {
      names: cacheNames,
      counts,
    },
    reminders: {
      notifiedKeys: notifiedKeyCount,
      hasRoutine: !!routineData,
      hasFizruk: !!fizrukData,
      hasNutrition: !!nutritionData,
    },
  };
}

async function clearAppCaches() {
  const names = await caches.keys();
  const toDelete = names.filter(
    (n) =>
      n === "google-fonts-css" ||
      n === "google-fonts-woff" ||
      n.startsWith("navigations-v") ||
      n.startsWith("api-cache-v") ||
      n.startsWith("workbox-precache"),
  );
  await Promise.allSettled(toDelete.map((n) => caches.delete(n)));
  return { ok: true, deleted: toDelete };
}

self.addEventListener("install", (event) => {
  // If a client explicitly asks for it, we can activate immediately.
  if (debugEnabled) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("message", (event) => {
  const { type, data } = event.data || {};

  if (type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (type === "SW_SET_DEBUG") {
    debugEnabled = data?.enabled === true;
    if (debugEnabled) {
      console.log("[sw] debug enabled", { version: SW_VERSION });
    }
    return;
  }

  if (type === "SW_DEBUG") {
    const requestId = data?.requestId || null;
    event.waitUntil(
      buildSwSnapshot()
        .then((snapshot) => {
          try {
            event.source?.postMessage?.({
              type: "SW_DEBUG_RESULT",
              requestId,
              snapshot,
            });
          } catch {
            /* noop */
          }
        })
        .catch((err) => {
          try {
            event.source?.postMessage?.({
              type: "SW_DEBUG_RESULT",
              requestId,
              snapshot: { ok: false, version: SW_VERSION, error: String(err) },
            });
          } catch {
            /* noop */
          }
        }),
    );
    return;
  }

  if (type === "CLEAR_SW_CACHES") {
    const requestId = data?.requestId || null;
    event.waitUntil(
      clearAppCaches()
        .then((result) => {
          try {
            event.source?.postMessage?.({
              type: "CLEAR_SW_CACHES_RESULT",
              requestId,
              result,
            });
          } catch {
            /* noop */
          }
        })
        .catch((err) => {
          try {
            event.source?.postMessage?.({
              type: "CLEAR_SW_CACHES_RESULT",
              requestId,
              result: { ok: false, error: String(err) },
            });
          } catch {
            /* noop */
          }
        }),
    );
    return;
  }

  if (type === "ROUTINE_STATE_UPDATE") {
    routineData = data;
    startReminderLoop();
    return;
  }

  if (type === "FIZRUK_STATE_UPDATE") {
    fizrukData = data;
    startReminderLoop();
    return;
  }

  if (type === "NUTRITION_STATE_UPDATE") {
    nutritionData = data;
    startReminderLoop();
    return;
  }

  if (type === "ROUTINE_NOTIFICATION_SENT") {
    if (data?.storageKey) recordNotified(data.storageKey);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const module = event.notification.data?.module;
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
      const cacheNames = await caches.keys();
      const stale = cacheNames.filter(
        (n) =>
          (n.startsWith("navigations-v") && n !== CACHE_NAMES.navigations) ||
          (n.startsWith("api-cache-v") && n !== CACHE_NAMES.api),
      );
      await Promise.allSettled(stale.map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// ── Web Push ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
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
