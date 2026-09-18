/**
 * Same-tab storage-refresh signal for Hub consumers.
 *
 * Hub cards aggregate cross-module data from storage (localStorage or the
 * SQLite warm caches) inside a `useMemo([period, offset])`. Because
 * `window "storage"` only fires for **cross-tab** writes, a write made in
 * the same tab never triggers a re-read, so the chart stays stale until
 * the user changes the period selector or reloads the page.
 *
 * Fix (audit-02 F3 / F10):
 *  - Same-tab signal: `hubBus "storageUpdated"` — emitted from each
 *    module's canonical write function (Routine → `emitRoutineStorage`,
 *    Fizruk → `notifyFizrukSqliteCacheRefresh`, Nutrition →
 *    `persistNutritionLog`, Finyk → `useMonobankWebhook` effect).
 *  - Cross-tab signal: native `window "storage"` event (unchanged behaviour).
 *
 * Both signals increment a `bump` counter that consumers include in their
 * `useMemo` dependency arrays. The memo re-runs, re-reads from storage,
 * and renders fresh data — no extra network calls, no React state loops
 * (hub cards are read-only consumers, they never write back to the same
 * keys that trigger the signal).
 */

import { useCallback, useEffect, useState } from "react";
import { onHubBus } from "@shared/lib/modules/hubBus";

/**
 * Returns a bump counter that increments whenever:
 *  - the `hubBus "storageUpdated"` event fires (same-tab write), or
 *  - the native `window "storage"` event fires (cross-tab write).
 *
 * Include the returned value in the `useMemo` dependency array of any
 * Hub component that reads from storage and needs to stay live.
 *
 * @example
 * ```tsx
 * const bump = useHubStorageBump();
 * const data = useMemo(() => readFromStorage(), [period, offset, bump]);
 * ```
 */
export function useHubStorageBump(): number {
  const [bump, setBump] = useState(0);

  const inc = useCallback(() => {
    setBump((n) => n + 1);
  }, []);

  // Same-tab signal: typed hub bus.
  useEffect(() => onHubBus("storageUpdated", inc), [inc]);

  // Cross-tab signal: native storage event.
  useEffect(() => {
    window.addEventListener("storage", inc);
    return () => {
      window.removeEventListener("storage", inc);
    };
  }, [inc]);

  return bump;
}
