import { useCallback } from "react";
import type { CurrentUser, SyncError, SyncState } from "../types";

/**
 * Cloud-sync orchestrator — **legacy v1 stub** post-ADR-0047.
 *
 * Until 2026-05-06 (Initiative 0003 Phase 5 client-side cutover) this
 * hook orchestrated three cooperating layers:
 *
 *   1. `enqueueChange` queue + dirty map
 *   2. `useSyncRetry` scheduler (online / change-event / periodic timer)
 *   3. Engine executors (`pushDirty`, `pushAll`, `pullAll`, `initialSync`,
 *      `uploadLocalData`) — each fired against `/api/sync/*` v1 endpoints.
 *
 * Per [ADR-0047](../../../../../../docs/adr/0047-cloudsync-v1-410-gone.md)
 * the server-side v1 channel is now `410 Gone`; calling it from the
 * client only generates toast spam and Sentry noise. The stub returns
 * the same public shape as before (so `App.tsx` / `OfflineBanner.tsx` /
 * `useAppEffects.ts` / `useSyncErrorToast.ts` keep type-checking) but
 * never fires an engine call. v2 cloud-sync (op-log) is owned by the
 * `apps/web/src/core/syncEngine/` writer-runtime, which is booted from
 * `apps/web/src/core/boot.ts` independently of this hook.
 *
 * Removal: PR #052 (Stage 7 cleanup) — entire `apps/web/src/core/cloudSync/`
 * tree drops, App.tsx wires `useSyncStatus` from the new v2 location.
 */
type SyncCallbackResult = boolean | undefined | void;
type AsyncSyncCallback = () => Promise<SyncCallbackResult>;

const noopAsync: AsyncSyncCallback = () => Promise.resolve(true);

export interface UseCloudSyncReturn {
  isSyncing: boolean;
  lastSyncAt: number | null;
  hasError: boolean;
  state: SyncState;
  syncErrorDetail: SyncError | null;
  syncing: boolean;
  lastSync: number | null;
  syncError: string | null;
  pushAll: AsyncSyncCallback;
  pullAll: AsyncSyncCallback;
  migrationPending: boolean;
  uploadLocalData: () => Promise<void>;
  skipMigration: () => void;
}

export function useCloudSync(
  _user: CurrentUser | null | undefined,
): UseCloudSyncReturn {
  const skipMigration = useCallback(() => {
    /* v2 op-log не вимагає migration prompt — більше немає `module_data` blob-у щоб мігрувати */
  }, []);

  const uploadLocalData = useCallback(async () => {
    /* v2 op-log seed-иться writer runtime-ом при першому push-у — explicit upload модалка більше не потрібна */
  }, []);

  return {
    isSyncing: false,
    lastSyncAt: null,
    hasError: false,
    state: "idle",
    syncErrorDetail: null,
    syncing: false,
    lastSync: null,
    syncError: null,
    pushAll: noopAsync,
    pullAll: noopAsync,
    migrationPending: false,
    uploadLocalData,
    skipMigration,
  };
}
