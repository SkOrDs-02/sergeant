import { useState } from "react";

/**
 * Tracks a derived `key` string across renders and calls `apply` exactly once
 * during the render where the key changes — using React's render-time setState
 * idiom (equivalent to `getDerivedStateFromProps`).
 *
 * Typical use-case: re-sync local state to a URL-derived value when the
 * location changes (back/forward navigation, external `navigate()` calls)
 * without introducing an effect that would fire a render cycle later.
 *
 * ```ts
 * useSyncedFromKey(location.search, () => {
 *   setHubViewRaw(readViewFromSearch(location.search));
 * });
 * ```
 *
 * Rules:
 * - `apply` is called with the **current render's closure** — never stale.
 * - The hook manages its own `prevKey` state; callers do not declare it.
 * - `apply` MUST NOT have side-effects that are not idempotent for the given
 *   key, because React may invoke the render function more than once in
 *   Strict Mode / concurrent features.
 */
export function useSyncedFromKey(key: string, apply: () => void): void {
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    apply();
  }
}
