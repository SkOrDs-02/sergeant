/**
 * Mobile cloud-sync orchestrator — **legacy v1 stub** post-ADR-0047.
 *
 * Until 2026-05-06 (Initiative 0003 Phase 5 client-side cutover) this
 * hook mirrored the web `useCloudSync` orchestrator: debounced "run
 * when dirty" scheduler, periodic retry, NetInfo-driven replay, and
 * initial sync на user-id change — all firing engine entry-points
 * проти `/api/sync/*` v1 endpoints.
 *
 * Per [ADR-0047](../../../../../../docs/adr/0047-cloudsync-v1-410-gone.md)
 * сервер v1 повертає `410 Gone`; виклики тільки спамлять toast-ами і
 * Sentry-noise. Stub зберігає той самий public shape (щоб
 * `CloudSyncProvider.tsx` і консьюмери з context-у компілилися) але
 * жодного engine-call-у не робить. Mobile v2 op-log writer-runtime
 * boot-иться окремо, поза цим хуком.
 *
 * Removal: PR #052 (Stage 7 cleanup) — entire `apps/mobile/src/sync/`
 * tree drops, `CloudSyncProvider` rewires `useSyncStatus` from new v2
 * location.
 */
import { useCallback } from "react";
import type { CurrentUser, SyncError, SyncState } from "../types";

export interface UseCloudSyncReturn {
  isSyncing: boolean;
  lastSyncAt: Date | null;
  hasError: boolean;
  state: SyncState;
  syncErrorDetail: SyncError | null;

  syncing: boolean;
  lastSync: Date | null;
  syncError: string | null;

  pushAll: () => Promise<void>;
  pullAll: () => Promise<boolean>;

  migrationPending: false;
  uploadLocalData: () => Promise<void>;
  skipMigration: () => void;
}

const noopPushAll = (): Promise<void> => Promise.resolve();
const noopPullAll = (): Promise<boolean> => Promise.resolve(true);

export function useCloudSync(
  _user: CurrentUser | null | undefined,
): UseCloudSyncReturn {
  const uploadLocalData = useCallback(async () => {
    /* v2 op-log seed-иться writer runtime-ом сам — explicit upload більше не потрібен */
  }, []);

  const skipMigration = useCallback(() => {
    /* v2 op-log не має `module_data` blob-у — нічого не мігрувати */
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
    pushAll: noopPushAll,
    pullAll: noopPullAll,
    migrationPending: false,
    uploadLocalData,
    skipMigration,
  };
}
