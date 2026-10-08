/**
 * Pure cache-policy constants — no workbox imports.
 *
 * Kept separate from `apps/web/src/sw/cache.ts` so unit tests can
 * import the prefix allowlist without dragging in `workbox-precaching`
 * / `workbox-routing` / `workbox-strategies` (which reference
 * `self.__WB_DISABLE_DEV_LOGS` at module-init time and crash under
 * jsdom). Pair file: `cache.test.ts`.
 */

/**
 * URL prefixes that must never be served from the NetworkFirst runtime
 * cache. Each entry below has a stale-state regression mode:
 *
 * - `/api/sync/`    — legacy v1 sync; `/pull` cursor is volatile.
 * - `/api/v2/sync/` — pullV2 / pushV2 / SSE stream. A 30-min stale
 *   `pull?since=N` makes the client think no new ops arrived for half
 *   an hour and silently falls behind; a cached SSE response is even
 *   worse (workbox would try to cache a long-lived `text/event-stream`
 *   as a single Response, and reconnects would hang on the cached
 *   partial stream).
 * - `/api/coach`         — Anthropic streaming response.
 * - `/api/weekly-digest` — time-windowed; stale window confuses UI.
 * - `/api/v1/*` дзеркала трьох попередніх (`/api/v1/coach`,
 *   `/api/v1/weekly-digest`, `/api/v1/sync/`): `@sergeant/api-client` за
 *   замовчуванням (`DEFAULT_API_PREFIX`) переписує `/api/*` у `/api/v1/*`
 *   ДО `fetch`, тож SW бачить саме v1-шляхи, і голі `/api/coach` не
 *   збігалися ні з чим (priv-08: `/api/v1/coach/*` ішов у кеш). `/api/v2/*`
 *   `applyApiPrefix` не переписує, тому v2-префікс лишається як є.
 *
 * Adding a new endpoint that returns time-sensitive or
 * server-authoritative state? Default-allow caching is the wrong call —
 * add the prefix here and write a unit test that asserts it does NOT
 * route through `NetworkFirst`.
 */
export const VOLATILE_API_PREFIXES: readonly string[] = [
  "/api/sync/",
  "/api/v2/sync/",
  "/api/coach",
  "/api/weekly-digest",
  "/api/v1/sync/",
  "/api/v1/coach",
  "/api/v1/weekly-digest",
] as const;

/**
 * Reusable predicate for the `registerRoute` `match` callback. Returns
 * `true` exactly when a request should be served through the
 * NetworkFirst runtime cache:
 *
 *   - path starts with `/api/`, AND
 *   - path is not `/api/auth/*` (stale session would auth as
 *     logged-out users), AND
 *   - path is not in {@link VOLATILE_API_PREFIXES}, AND
 *   - method is `GET` (mutations have no business in a runtime cache).
 *
 * Mirrored verbatim by the test suite so the contract is enforced.
 */
export function shouldUseRuntimeCache(
  pathname: string,
  method: string,
): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/api/auth/")) return false;
  if (VOLATILE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix)))
    return false;
  return method === "GET";
}

export function shouldCacheExerciseImage(pathname: string): boolean {
  return pathname.startsWith("/exercises/");
}

/**
 * Партиція, яку SW використовує, поки не знає, чий це кеш (старт без
 * відновленого ключа, вихід, анонімна сесія). Спільна для всіх.
 */
export const ANON_PARTITION = "anon";

/**
 * priv-08: рішення «чи можна читати/писати runtime-кеш для цього запиту при
 * ключі партиції X».
 *
 * Автентифіковані `/api/*` відповіді кешуються лише під ключем конкретного
 * користувача. Поки ключ невідомий (`anon`, порожній, `null` — SW щойно
 * перезапустився після idle-kill і ще не прочитав збережений ключ), у спільну
 * партицію нічого не пишемо й нічого з неї не віддаємо: інакше `/api/v1/me`
 * користувача A, записаний під `__u=anon`, у сесії B віддавався б офлайн.
 * Анонімні сторінки автентифікованих `/api` не викликають, тож це безпечно.
 * Не-API запити (навігації) партицію `anon` використовують і далі.
 */
export function canUseCachePartition(
  pathname: string,
  partitionKey: string | null | undefined,
): boolean {
  if (!pathname.startsWith("/api/")) return true;
  return !!partitionKey && partitionKey !== ANON_PARTITION;
}

export type ClearCachesScope = "user" | "all";

/** Метадані SW (хеш активного користувача). Не версіонується з `CACHE_NAMES`. */
export const SW_META_CACHE_NAME = "sw-meta";

/**
 * rel-12: які CacheStorage-кеші викидати.
 *
 * - `"user"` (вихід, втрата сесії) — лише те, що може містити дані
 *   користувача: `navigations-v*`, `api-cache-v*` і метадані партиції.
 *   Precache (ассети збірки) і ілюстрації вправ даних користувача не мають;
 *   Workbox не відновлює precache сам (у маніфесті немає integrity), тож його
 *   видалення ламало офлайн-запуск PWA до наступного деплою.
 * - `"all"` (ручне «Скинути кеш PWA») — повний набір; викликач після цього
 *   мусить зняти реєстрацію SW, щоб наступне завантаження заново поставило
 *   precache.
 */
export function selectCachesToClear(
  names: readonly string[],
  scope: ClearCachesScope,
): string[] {
  return names.filter((n) => {
    if (
      n === SW_META_CACHE_NAME ||
      n.startsWith("navigations-v") ||
      n.startsWith("api-cache-v")
    ) {
      return true;
    }
    if (scope !== "all") return false;
    return (
      n === "google-fonts-css" ||
      n === "google-fonts-woff" ||
      n.startsWith("exercise-images-v") ||
      n.startsWith("workbox-precache")
    );
  });
}
