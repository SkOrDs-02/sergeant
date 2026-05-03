import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { monoWebhookApi, type MonoBackfillProgress } from "@shared/api";
import { finykKeys, hubKeys } from "@shared/lib/api/queryKeys";
import { authAwareRetry } from "@shared/lib/api/queryClient";

/**
 * Poll cadence while the server reports `status === "running"`. 2 s gives a
 * noticeably-live progress bar without DDoS-ing the API. The endpoint is a
 * single in-memory map lookup so cost is negligible.
 */
const RUNNING_POLL_MS = 2_000;

/**
 * `useMonoBackfillProgress`
 *
 * Subscribes to `GET /api/mono/backfill-progress` and polls every 2 s while
 * the server reports an in-flight job. Returns the current snapshot plus
 * convenience flags for UI rendering.
 *
 * The polling collapses automatically once the server flips status to
 * `completed`/`failed`/`idle` — React Query's `refetchInterval` accepts a
 * function-of-data so we can switch off the timer without an effect.
 *
 * Side-effects on completion:
 *  - invalidates `finykKeys.monoSyncState` (so `lastBackfillAt` refreshes),
 *  - invalidates `finykKeys.monoWebhookTransactions()` so the freshly
 *    upserted rows show up without a manual refresh,
 *  - bumps `hubKeys.preview("finyk")` for the dashboard tile.
 */
export function useMonoBackfillProgress({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();

  const query = useQuery<MonoBackfillProgress>({
    queryKey: finykKeys.monoBackfillProgress,
    queryFn: ({ signal }) => monoWebhookApi.backfillProgress({ signal }),
    enabled,
    // No `staleTime`: each manual `triggerBackfill()` invalidates this key
    // and we want the next render to reflect the fresh "running" snapshot
    // without serving the stale "idle" / "completed" payload.
    staleTime: 0,
    refetchInterval: (q) =>
      q.state.data?.status === "running" ? RUNNING_POLL_MS : false,
    refetchOnWindowFocus: false,
    retry: authAwareRetry(1),
  });

  const status = query.data?.status ?? "idle";
  const isRunning = status === "running";

  // When the server flips out of `running`, fan out an invalidation across
  // the dependent caches so the UI catches up in one tick. Uses the query's
  // `dataUpdatedAt` as the trigger so we only fire once per state change.
  useEffect(() => {
    if (status === "completed" || status === "failed") {
      queryClient.invalidateQueries({ queryKey: finykKeys.monoSyncState });
      queryClient.invalidateQueries({
        queryKey: finykKeys.monoWebhookTransactions(),
      });
      queryClient.invalidateQueries({ queryKey: hubKeys.preview("finyk") });
    }
  }, [status, query.dataUpdatedAt, queryClient]);

  return {
    progress: query.data ?? null,
    isRunning,
    isCompleted: status === "completed",
    isFailed: status === "failed",
    isIdle: status === "idle",
  };
}
