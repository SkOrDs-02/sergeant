import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { syncKeys } from "@shared/lib/api/queryKeys";

import { getSyncEngineWriter } from "../../syncEngine/singleton";

/**
 * Lightweight hook that mirrors the v2 op-log writer's outbox counters
 * into React state so `OfflineBanner.tsx` can render a "blocked /
 * syncing / offline" pill without owning the full sync lifecycle.
 *
 * Stage 13 PR #077: `dirtyCount` and `queuedCount` (always `0` since
 * the v1 engine drop in PR #052b) removed from the return shape.
 * `OfflineBanner` now reads `syncV2PendingCount` directly.
 *
 * Polling doctrine (closes audit P2-D —
 * `docs/audits/2026-05-13-web-architecture-state-roast.md`):
 *
 *   - `getStatus()` is wrapped in a React Query so it auto-refetches
 *     every {@link SYNC_STATUS_POLL_MS} while the session is online —
 *     before this hook used `useState` + `useEffect` and only
 *     re-fetched on `online`/`offline` window events, so an
 *     in-session push that filled the outbox left the pill stale
 *     until the next reconnect.
 *   - On `online`/`offline` transitions we invalidate the query so
 *     the next read is fresh (`enabled` stays `true`, but
 *     `refetchInterval` flips off when offline so we don't
 *     pointlessly hammer SQLite in airplane mode).
 *   - Window focus also triggers a refetch, matching React Query's
 *     defaults — useful for users who keep the tab in the background.
 *   - Hard Rule #2 — the key lives in `syncKeys.status()` factory in
 *     `apps/web/src/shared/lib/api/queryKeys.ts`, not inline.
 */
export const SYNC_STATUS_POLL_MS = 30_000;

interface SyncStatusState {
  isOnline: boolean;
  syncV2PendingCount: number;
  syncV2RejectedCount: number;
  syncV2DeadLetterCount: number;
  retrySyncV2DeadLetters: () => Promise<void>;
}

interface SyncStatusCounts {
  readonly pending: number;
  readonly rejected: number;
  readonly dead_letter: number;
}

const EMPTY_COUNTS: SyncStatusCounts = {
  pending: 0,
  rejected: 0,
  dead_letter: 0,
};

async function fetchSyncStatus(): Promise<SyncStatusCounts> {
  const runtime = getSyncEngineWriter();
  if (!runtime) return EMPTY_COUNTS;
  try {
    return await runtime.getStatus();
  } catch {
    // Soft-fail: a missing/locked SQLite shouldn't surface as a hook-level
    // error to `OfflineBanner` — fall back to the empty counters so the
    // pill keeps rendering instead of throwing past the Suspense boundary.
    return EMPTY_COUNTS;
  }
}

const retrySyncV2DeadLetters = async (): Promise<void> => {
  await getSyncEngineWriter()?.recoverAllDeadLetters();
};

export function useSyncStatus(): SyncStatusState {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: syncKeys.status(),
    queryFn: fetchSyncStatus,
    refetchInterval: isOnline ? SYNC_STATUS_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    // `getStatus()` reads the local SQLite outbox, not the network, so we
    // must opt out of React Query's default `networkMode: "online"` —
    // otherwise the query would be paused exactly when we want the
    // freshest counts (offline / on the `offline` event).
    networkMode: "always",
    staleTime: 0,
  });

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: syncKeys.status() });
  }, [isOnline, queryClient]);

  const counts = data ?? EMPTY_COUNTS;

  return {
    isOnline,
    syncV2PendingCount: counts.pending,
    syncV2RejectedCount: counts.rejected,
    syncV2DeadLetterCount: counts.dead_letter,
    retrySyncV2DeadLetters,
  };
}
