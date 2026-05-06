/// <reference lib="WebWorker" />
/**
 * Workbox precache + runtime cache routes + cache-cleanup helpers.
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 * Сторонні залежності (workbox-*) живуть тільки тут — entry-point
 * лишається коротким composition root-ом.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { CACHE_NAMES } from "./version";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

/**
 * Реєструє precache + 2 runtime route-и (навігація + API). Викликається
 * один раз при старті SW. Розбиття на функцію (а не side-effect на
 * import) дає змогу легше mock-ати у тестах і робить порядок
 * ініціалізації явним.
 */
export function setupCacheRoutes(): void {
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
  // (POST/PUT/DELETE) are NOT cached; mutation retry semantics live in the
  // app-level sync writer rather than in the service worker cache.
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
}

export async function cacheEntryCount(
  cacheName: string,
): Promise<number | null> {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return null;
  }
}

/**
 * Повертає список застарілих cache-name-ів (older `navigations-v*` /
 * `api-cache-v*`), які SW зачищає на `activate`.
 */
export async function listStaleCaches(): Promise<string[]> {
  const cacheNames = await caches.keys();
  return cacheNames.filter(
    (n) =>
      (n.startsWith("navigations-v") && n !== CACHE_NAMES.navigations) ||
      (n.startsWith("api-cache-v") && n !== CACHE_NAMES.api),
  );
}

/**
 * Викидає все, що SW колись закешував (precache, navigation, API,
 * Google Fonts). Використовується ручним «Очистити кеш» з UI.
 */
export async function clearAppCaches(): Promise<{
  ok: true;
  deleted: string[];
}> {
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
