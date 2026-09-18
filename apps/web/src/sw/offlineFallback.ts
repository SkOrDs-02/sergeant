/**
 * Offline navigation fallback — pure, workbox-free logic so it can be
 * unit-tested under jsdom (importing workbox crashes jsdom at module-init;
 * same rationale as `./cachePolicy`). `./cache` wires these into a workbox
 * `setCatchHandler`.
 *
 * page-audit-10 F1: the SW had no offline navigation fallback — a navigation
 * to a never-cached route while offline dead-ended at the browser's default
 * error. The catch handler now returns the precached app shell so the SPA
 * boots offline (and can render its own offline/empty states) instead.
 */

/**
 * Candidate precache keys for the app shell, tried in order. The exact key
 * depends on the Vite `base` / precache-manifest shape, so we probe a small
 * list rather than hard-coding one form.
 */
export const OFFLINE_SHELL_CANDIDATES = [
  "/index.html",
  "index.html",
  "/",
] as const;

/** True only for top-level document navigations (not asset/API fetches). */
export function isNavigationRequest(mode: string | undefined): boolean {
  return mode === "navigate";
}

/**
 * Return the first precached shell that `match` resolves, or `undefined` if
 * none is cached (caller then falls back to the default error response, i.e.
 * no behaviour change versus today). Generic over the match return type so
 * tests don't need a real `Response`.
 */
export async function resolveOfflineShell<T>(
  match: (url: string) => Promise<T | undefined | null>,
  candidates: readonly string[] = OFFLINE_SHELL_CANDIDATES,
): Promise<T | undefined> {
  for (const url of candidates) {
    const hit = await match(url);
    if (hit) return hit;
  }
  return undefined;
}
