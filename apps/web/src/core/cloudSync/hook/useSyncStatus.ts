import { useEffect, useState } from "react";
import { SYNC_EVENT, SYNC_STATUS_EVENT } from "@sergeant/shared";

import { getSyncEngineWriter } from "../../syncEngine/singleton";

/**
 * Lightweight hook that mirrors the v2 op-log writer's outbox counters
 * into React state so `OfflineBanner.tsx` can render a "blocked /
 * syncing / offline" pill without owning the full sync lifecycle.
 *
 * Pre-PR-#052b this hook also read v1's `dirtyModules` map and
 * `offlineQueue` length. Both stores were dropped together with the v1
 * engine in PR #052b — `dirtyCount` and `queuedCount` are kept on the
 * return shape (always `0`) so `OfflineBanner` can stay agnostic about
 * which channel actually fed the value.
 */
interface SyncStatusState {
  dirtyCount: number;
  queuedCount: number;
  isOnline: boolean;
  syncV2PendingCount: number;
  syncV2RejectedCount: number;
  syncV2DeadLetterCount: number;
  retrySyncV2DeadLetters: () => Promise<void>;
}

const retrySyncV2DeadLetters = async (): Promise<void> => {
  await getSyncEngineWriter()?.recoverAllDeadLetters();
};

function readBaseStatus(): SyncStatusState {
  return {
    dirtyCount: 0,
    queuedCount: 0,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncV2PendingCount: 0,
    syncV2RejectedCount: 0,
    syncV2DeadLetterCount: 0,
    retrySyncV2DeadLetters,
  };
}

export function useSyncStatus(): SyncStatusState {
  const [state, setState] = useState<SyncStatusState>(() => readBaseStatus());

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      const next = readBaseStatus();
      const runtime = getSyncEngineWriter();
      if (!runtime) {
        setState(next);
        return;
      }

      void runtime
        .getStatus()
        .then((counts) => {
          if (!mounted) return;
          setState({
            ...next,
            syncV2PendingCount: counts.pending,
            syncV2RejectedCount: counts.rejected,
            syncV2DeadLetterCount: counts.dead_letter,
          });
        })
        .catch(() => {
          if (!mounted) return;
          setState(next);
        });
    };

    refresh();
    window.addEventListener(SYNC_STATUS_EVENT, refresh);
    window.addEventListener(SYNC_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      mounted = false;
      window.removeEventListener(SYNC_STATUS_EVENT, refresh);
      window.removeEventListener(SYNC_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  return state;
}
