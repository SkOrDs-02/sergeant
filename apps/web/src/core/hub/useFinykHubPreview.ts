import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { safeReadLS } from "@shared/lib/storage";
import { hubKeys } from "@shared/lib/queryKeys";

/**
 * React Query-backed signal for "does Finyk have Monobank data loaded?".
 *
 * Replaces the legacy `window.dispatchEvent("hub-finyk-cache-updated")` fan-out
 * used by the Hub chat and the Routine calendar. Writers (see
 * `useMonobank.saveCache/disconnect/clearTxCache` and the Settings "Clear
 * cache" button) invalidate `hubKeys.preview("finyk")`, and every consumer
 * that subscribes to this hook re-renders without a manual bus.
 *
 * Cross-tab updates are covered by listening to the `storage` event and
 * triggering the same invalidation — `localStorage` already broadcasts the
 * write to other tabs, so we only need to rebuild the derived value there.
 */

const TX_CACHE_LS_KEY = "finyk_tx_cache";

export interface FinykHubPreview {
  hasMonoData: boolean;
}

function readHasMonoData(): boolean {
  const parsed = safeReadLS<{ txs?: unknown[] }>(TX_CACHE_LS_KEY);
  return Array.isArray(parsed?.txs) && parsed.txs.length > 0;
}

function readPreview(): FinykHubPreview {
  return { hasMonoData: readHasMonoData() };
}

export function useFinykHubPreview() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === TX_CACHE_LS_KEY) {
        queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  return useQuery({
    queryKey: hubKeys.preview("finyk"),
    queryFn: readPreview,
    // The source of truth is `localStorage`; RQ is used purely as a pub/sub
    // broadcaster for derived values. Explicit invalidations refetch.
    staleTime: 60_000,
    gcTime: Infinity,
    // Returning to the tab rebuilds the preview — covers the case where a
    // storage event was dropped (Safari occasionally does). Use "always" so
    // the refetch fires even when the query is still fresh within staleTime.
    refetchOnWindowFocus: "always",
  });
}
