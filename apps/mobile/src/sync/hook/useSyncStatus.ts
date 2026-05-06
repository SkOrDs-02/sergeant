/**
 * Lightweight read-only hook that feeds `SyncStatusIndicator`.
 *
 * Pre-PR-#052c this hook читало live v1 state — `dirtyModules` map, the
 * MMKV-backed `offlineQueue`, NetInfo-driven online flag — і пушило
 * refresh-events через v1 emitter. Усе те дерево пішло разом із
 * engine-ом у PR #052c (cloudSync v1 cleanup mirror того, що web
 * зробив у PR #052b).
 *
 * Now that the mobile sync v2 writer-runtime is wired into
 * `apps/mobile/app/_layout.tsx` (`bootSyncEngineWriter`), the hook
 * bridges the runtime's `getStatus()` reader (counts of `pending` /
 * `rejected` / `dead_letter` outbox rows) onto the legacy shape that
 * `SyncStatusIndicator.tsx` already consumes:
 *   - `queuedCount = pending`
 *   - `dirtyCount  = rejected + dead_letter`
 *   - `isOnline`  bridges `@react-native-community/netinfo` directly
 *     (same pattern as `useIsOffline` in `OfflineBanner.tsx`).
 *
 * Until the runtime has booted (e.g. very first frame after
 * `setStorageReady(true)`, or when a native build skips the SQLite
 * module), the hook falls through to the idle snapshot, which keeps
 * `SyncStatusIndicator` in its "Синк: on" pill instead of flashing a
 * stale syncing state. Web counterpart —
 * `apps/web/src/core/syncEngine/syncEngineWriter.ts` — uses the same
 * `getStatus().pending` shape; this file is its mobile read-side mirror.
 */
import { useEffect, useState } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { getSyncEngineWriter } from "@/core/syncEngine/singleton";

export interface SyncStatusState {
  dirtyCount: number;
  queuedCount: number;
  isOnline: boolean;
}

const idleSnapshot: SyncStatusState = {
  dirtyCount: 0,
  queuedCount: 0,
  isOnline: true,
};

const POLL_INTERVAL_MS = 5_000;

export function useSyncStatus(): SyncStatusState {
  const [state, setState] = useState<SyncStatusState>(idleSnapshot);

  useEffect(() => {
    let cancelled = false;

    const readStatus = async (): Promise<void> => {
      const runtime = getSyncEngineWriter();
      if (runtime === null) {
        // Runtime not booted yet — keep idle snapshot. The poll
        // interval below will pick it up on the next tick.
        return;
      }
      try {
        const counts = await runtime.getStatus();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          queuedCount: counts.pending,
          dirtyCount: counts.rejected + counts.dead_letter,
        }));
      } catch {
        // `getStatus()` failure must never break the indicator —
        // the writer-runtime already routes its own errors through
        // `captureException`. Keep the previous state.
      }
    };

    void readStatus();
    const handle = setInterval(() => {
      void readStatus();
    }, POLL_INTERVAL_MS);

    const unsubscribeNetInfo = NetInfo.addEventListener(
      (netState: NetInfoState) => {
        if (cancelled) return;
        const online =
          netState.isConnected !== false &&
          netState.isInternetReachable !== false;
        setState((prev) =>
          prev.isOnline === online ? prev : { ...prev, isOnline: online },
        );
      },
    );

    return () => {
      cancelled = true;
      clearInterval(handle);
      unsubscribeNetInfo();
    };
  }, []);

  return state;
}
