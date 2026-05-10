import { useEffect, useState } from "react";

import { getSyncEngineWriter } from "../../syncEngine/singleton";

/**
 * Lightweight hook that mirrors the v2 op-log writer's outbox counters
 * into React state so `OfflineBanner.tsx` can render a "blocked /
 * syncing / offline" pill without owning the full sync lifecycle.
 *
 * Stage 13 PR #077: `dirtyCount` and `queuedCount` (always `0` since
 * the v1 engine drop in PR #052b) removed from the return shape.
 * `OfflineBanner` now reads `syncV2PendingCount` directly.
 */
interface SyncStatusState {
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
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      mounted = false;
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  return state;
}
