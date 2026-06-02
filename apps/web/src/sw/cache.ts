/// <reference lib="WebWorker" />
/**
 * Workbox precache + runtime cache routes + cache-cleanup helpers.
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 * Сторонні залежності (workbox-*) живуть тільки тут — entry-point
 * лишається коротким composition root-ом.
 */

import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  matchPrecache,
} from "workbox-precaching";
import {
  registerRoute,
  NavigationRoute,
  setCatchHandler,
} from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { CACHE_NAMES } from "./version";
import { shouldUseRuntimeCache } from "./cachePolicy";
import { isNavigationRequest, resolveOfflineShell } from "./offlineFallback";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

/**
 * Audit 03 / Decision #2 (C): module-scope active-user partition.
 *
 * Holds the opaque Better Auth user id posted from the main thread via
 * `SW_SET_USER`. The `cacheKeyWillBeUsed` plugin below appends it to the
 * Request URL (`__u=<userKey>`) so user A's cache entries never resolve
 * user B's reads. Resets to `"anon"` on SW restart — main thread re-posts
 * on next mount, and `signOut → CLEAR_SW_CACHES` already wipes the caches
 * as the security boundary.
 *
 * Why a query param and not a per-user cacheName: cache.delete() under
 * `clearAppCaches` already walks every cache name; an unbounded set of
 * per-user cache names would leak across logged-out users and require
 * extra cleanup logic. A varied cache *key* keeps the cache count fixed.
 */
let activeUserKey = "anon";

export function setActiveUserKey(key: string | null): void {
  activeUserKey = key && key.length > 0 ? key : "anon";
}

export function getActiveUserKey(): string {
  return activeUserKey;
}

const PARTITION_PARAM = "__u";

/**
 * Workbox `cacheKeyWillBeUsed` hook: appends the active user key as a
 * synthetic query param so the cache key varies per user without changing
 * the actual network Request that flies on miss. Drop-in: idempotent if
 * called twice on the same Request.
 */
const userPartitionPlugin = {
  cacheKeyWillBeUsed: async ({
    request,
  }: {
    request: Request;
    mode: string;
  }): Promise<Request> => {
    try {
      const url = new URL(request.url);
      if (url.searchParams.get(PARTITION_PARAM) === activeUserKey) {
        return request;
      }
      url.searchParams.set(PARTITION_PARAM, activeUserKey);
      return new Request(url.toString(), {
        method: request.method,
        headers: request.headers,
      });
    } catch {
      return request;
    }
  },
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
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          userPartitionPlugin,
        ],
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
    // Predicate lives in `./cachePolicy` so it can be unit-tested
    // without dragging workbox imports into the jsdom env. See
    // `cachePolicy.ts` for the canonical volatile-prefix list +
    // rationale (T3 audit MEDIUM finding — `/api/v2/sync/*` was
    // previously cacheable and silently desynced pullV2/SSE).
    ({ url, request }) => shouldUseRuntimeCache(url.pathname, request.method),
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
        userPartitionPlugin,
      ],
    }),
    "GET",
  );

  // Offline navigation fallback (page-audit-10 F1). `setCatchHandler` only
  // runs when a matched route's handler *throws* — i.e. the navigation
  // NetworkFirst above already tried network (3s) and missed the cache while
  // offline. The success path and every non-navigation request are untouched;
  // if no shell is precached we return the default error (no behaviour change
  // vs today), so the blast radius is exactly the already-broken offline-miss.
  setCatchHandler(async ({ request }) => {
    if (isNavigationRequest(request.mode)) {
      const shell = await resolveOfflineShell((url) => matchPrecache(url));
      if (shell) return shell;
    }
    return Response.error();
  });
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
