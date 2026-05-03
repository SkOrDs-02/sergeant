/**
 * Connection-aware prefetch gate.
 *
 * `prefetchModule` / `prefetchPage` / `prefetchCriticalModules` ought to
 * be silent on the network — they pay download cost for code the user
 * may never reach. On 2G / save-data sessions that trade is upside-down:
 * we burn the user's data plan while making their *current* navigation
 * slower (browsers serialize prefetches behind active requests).
 *
 * The diagnostics doc (`docs/diagnostics/2026-05-03-web-deep-dive/`
 * §5.2 / §10.4) calls out that `prefetchCriticalModules` previously
 * fired on idle for *every* user regardless of `navigator.connection`.
 * This module is the single gate everywhere we'd kick off an
 * eager `import("../../modules/...")`.
 *
 * Contract.
 *  - Returns `true` when the browser doesn't expose `navigator.connection`
 *    (Safari, older browsers) — fail-open keeps prefetch behaviour for
 *    the majority of fast iOS/macOS sessions where it is cheap.
 *  - Returns `false` when the user opted into Data Saver
 *    (`saveData === true`).
 *  - Returns `false` for `effectiveType` of `"slow-2g"` / `"2g"` —
 *    Chrome's heuristic for « heavy idle prefetch will hurt » based on
 *    rolling RTT/throughput.
 *  - Otherwise `true` (3G/4G/5G/wifi).
 *
 * No imports — must be safe to call from the SW or any worker context
 * that mirrors `navigator.connection`.
 */

interface ConnectionShape {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g" | string;
}

interface NavigatorWithConnection extends Navigator {
  connection?: ConnectionShape;
}

/**
 * Returns `true` when it is OK to spend bandwidth on prefetching code
 * the user may not reach yet. See file-level doc for contract.
 */
export function shouldPrefetchOnConnection(): boolean {
  if (typeof navigator === "undefined") return true;
  const conn = (navigator as NavigatorWithConnection).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") {
    return false;
  }
  return true;
}
