import { useEffect, useState } from "react";
import { SYNC_EVENT, SYNC_STATUS_EVENT } from "../config";
import { getDirtyModules } from "../state/dirtyModules";
import { getOfflineQueue } from "../queue/offlineQueue";
import { getSyncEngineWriter } from "../../syncEngine/singleton";

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

function readLegacyStatus(): SyncStatusState {
  return {
    dirtyCount: Object.keys(getDirtyModules()).length,
    queuedCount: getOfflineQueue().length,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    syncV2PendingCount: 0,
    syncV2RejectedCount: 0,
    syncV2DeadLetterCount: 0,
    retrySyncV2DeadLetters,
  };
}

/**
 * Lightweight hook exposing just the local sync state (dirty modules,
 * offline queue, online status) so UI components can render status
 * indicators without owning the full cloud-sync lifecycle.
 */
export function useSyncStatus(): SyncStatusState {
  const [state, setState] = useState<SyncStatusState>(() => readLegacyStatus());

  useEffect(() => {
    let mounted = true;

    const refresh = () => {
      const next = readLegacyStatus();
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
