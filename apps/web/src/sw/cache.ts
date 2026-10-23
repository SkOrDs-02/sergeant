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
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { CACHE_NAMES } from "./version";
import {
  canUseCachePartition,
  selectCachesToClear,
  shouldCacheExerciseImage,
  shouldUseRuntimeCache,
  type ClearCachesScope,
} from "./cachePolicy";
import {
  getActiveUserKey,
  primeActiveUserKey,
  resetActiveUserKeyInMemory,
} from "./activeUserKey";
import { isNavigationRequest, resolveOfflineShell } from "./offlineFallback";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// `messages.ts` імпортує звідси; сама логіка ключа живе без workbox-імпортів.
export { setActiveUserKey } from "./activeUserKey";

const PARTITION_PARAM = "__u";

/**
 * Workbox `cacheKeyWillBeUsed` hook: appends the active user key as a
 * synthetic query param so the cache key varies per user without changing
 * the actual network Request that flies on miss. Drop-in: idempotent if
 * called twice on the same Request.
 *
 * Ключ партиції (хеш користувача, див. `./activeUserKey`) переживає
 * перезапуск SW і ліниво відновлюється, тож плагін чекає на нього, а не читає
 * змінну, що після idle-kill була б `anon` (priv-08).
 */
const userPartitionPlugin = {
  cacheKeyWillBeUsed: async ({
    request,
  }: {
    request: Request;
    mode: string;
  }): Promise<Request> => {
    try {
      const activeUserKey = await getActiveUserKey();
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
 * priv-08: поки партиція користувача невідома (`anon`), runtime-кеш `/api/*`
 * не читаємо й не пишемо. Автентифіковані відповіді під спільним `__u=anon`
 * потрапляли б до наступного користувача (рішення — `canUseCachePartition`).
 * Стоїть ПЕРЕД `userPartitionPlugin`-ом у списку плагінів лише для
 * читабельності: ці хуки з `cacheKeyWillBeUsed` не перетинаються.
 */
const apiPartitionGuardPlugin = {
  cacheWillUpdate: async ({
    request,
    response,
  }: {
    request: Request;
    response: Response;
  }): Promise<Response | null> => {
    const key = await getActiveUserKey();
    return canUseCachePartition(new URL(request.url).pathname, key)
      ? response
      : null;
  },
  cachedResponseWillBeUsed: async ({
    request,
    cachedResponse,
  }: {
    request: Request;
    cachedResponse?: Response;
  }): Promise<Response | null | undefined> => {
    const key = await getActiveUserKey();
    return canUseCachePartition(new URL(request.url).pathname, key)
      ? cachedResponse
      : null;
  },
};

/**
 * Реєструє precache і runtime route-и. Викликається
 * один раз при старті SW. Розбиття на функцію (а не side-effect на
 * import) дає змогу легше mock-ати у тестах і робить порядок
 * ініціалізації явним.
 */
export function setupCacheRoutes(): void {
  // Прогріваємо відновлення партиції з `sw-meta` на холодному старті воркера.
  primeActiveUserKey();
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
        apiPartitionGuardPlugin,
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

  registerRoute(
    ({ url }) => shouldCacheExerciseImage(url.pathname),
    new CacheFirst({
      cacheName: CACHE_NAMES.exerciseImages,
      plugins: [
        new ExpirationPlugin({
          maxEntries: 400,
          maxAgeSeconds: 60 * 60 * 24 * 180,
          purgeOnQuotaError: true,
        }),
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
 * `api-cache-v*` / `exercise-images-v*`), які SW зачищає на `activate`.
 */
export async function listStaleCaches(): Promise<string[]> {
  const cacheNames = await caches.keys();
  return cacheNames.filter(
    (n) =>
      (n.startsWith("navigations-v") && n !== CACHE_NAMES.navigations) ||
      (n.startsWith("api-cache-v") && n !== CACHE_NAMES.api) ||
      (n.startsWith("exercise-images-v") && n !== CACHE_NAMES.exerciseImages),
  );
}

/**
 * Видаляє кеші SW за скоупом (вибір — `selectCachesToClear` у `./cachePolicy`)
 * і скидає активну партицію користувача.
 *
 * - `"user"` (за замовчуванням; вихід, втрата сесії) — `navigations-v*`,
 *   `api-cache-v*`, `sw-meta`. Precache і ілюстрації вправ лишаються: даних
 *   користувача в них немає, а Workbox сам їх не відновить (rel-12).
 * - `"all"` — ручне «Скинути кеш PWA»: ще й precache, шрифти, ілюстрації.
 *   Після цього викликач зобовʼязаний зняти реєстрацію SW.
 */
export async function clearAppCaches(
  scope: ClearCachesScope = "user",
): Promise<{
  ok: true;
  deleted: string[];
}> {
  const names = await caches.keys();
  const toDelete = selectCachesToClear(names, scope);
  // Спершу скидаємо ключ у памʼяті: поки йде видалення, нічий кеш не активний.
  resetActiveUserKeyInMemory();
  await Promise.allSettled(toDelete.map((n) => caches.delete(n)));
  return { ok: true, deleted: toDelete };
}
