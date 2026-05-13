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
