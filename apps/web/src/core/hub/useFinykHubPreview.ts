import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@sergeant/shared";
import { hubKeys } from "@shared/lib/api/queryKeys";
import { getVisibleFinykMonoMirrorState } from "../../modules/finyk/lib/monoMirrorReader";
import { useFinykMonoMirrorTick } from "../../modules/finyk/lib/monoMirrorGate";
import { useFinykSqliteReadTick } from "../../modules/finyk/lib/sqliteReadGate";

/**
 * React Query-backed signal for "does Finyk have Monobank data loaded?".
 *
 * Replaces the legacy `window.dispatchEvent("hub-finyk-cache-updated")` fan-out
 * used by the Hub chat and the Routine calendar. Writers (see
 * `useMonobank.saveCache/disconnect/clearTxCache` and the Settings "Clear
 * cache" button) invalidate `hubKeys.preview("finyk")`, and every consumer
 * that subscribes to this hook re-renders without a manual bus.
 *
 * The canonical SQLite mirror and account preferences notify this preview
 * after hydration/pull. The old LS transaction shard is no longer written.
 * Cross-tab storage events remain an additional invalidation signal.
 */

export interface FinykHubPreview {
  hasMonoData: boolean;
}

function readHasMonoData(): boolean {
  return getVisibleFinykMonoMirrorState().transactions.length > 0;
}

function readPreview(): FinykHubPreview {
  return { hasMonoData: readHasMonoData() };
}

export function useFinykHubPreview() {
  const queryClient = useQueryClient();
  const mirrorTick = useFinykMonoMirrorTick();
  const sqliteTick = useFinykSqliteReadTick();

  useEffect(() => {
    void mirrorTick;
    void sqliteTick;
    void queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
  }, [queryClient, mirrorTick, sqliteTick]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      // Comparing against the same LS preview key (see readHasMonoData above).
      // eslint-disable-next-line no-restricted-syntax -- storage-event key match for FINYK_TX_CACHE preview shard (same intentional LS read)
      if (e.key === null || e.key === STORAGE_KEYS.FINYK_TX_CACHE) {
        queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [queryClient]);

  return useQuery({
    queryKey: hubKeys.preview("finyk"),
    queryFn: readPreview,
    // The source of truth is the SQLite mirror; RQ is used as a pub/sub
    // broadcaster for derived values. Explicit invalidations refetch.
    staleTime: 60_000,
    gcTime: Infinity,
    // Returning to the tab rebuilds the preview — covers the case where a
    // storage event was dropped (Safari occasionally does). Use "always" so
    // the refetch fires even when the query is still fresh within staleTime.
    refetchOnWindowFocus: "always",
  });
}
