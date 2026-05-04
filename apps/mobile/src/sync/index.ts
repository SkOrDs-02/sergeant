/**
 * Public barrel for the mobile cloud-sync subsystem. Shape mirrors the
 * web barrel at `apps/web/src/core/cloudSync/index.ts` so code ported
 * from web can import from `@/sync` with minimal churn.
 */
export { SYNC_EVENT, SYNC_STATUS_EVENT } from "./config";

export { getDirtyModules } from "./state/dirtyModules";
export { getOfflineQueue } from "./queue/offlineQueue";
export {
  clearDeadLetters,
  getDeadLetterCount,
  getDeadLetterEntries,
} from "./queue/deadLetter";

export { enqueueChange, notifySyncDirty } from "./enqueue";
export { useSyncedStorage } from "./useSyncedStorage";

export { useCloudSync } from "./hook/useCloudSync";
export type { UseCloudSyncReturn } from "./hook/useCloudSync";
export { useSyncStatus } from "./hook/useSyncStatus";
export type { SyncStatusState } from "./hook/useSyncStatus";

export {
  CloudSyncContext,
  CloudSyncProvider,
  useCloudSyncContext,
} from "./CloudSyncProvider";

export type {
  CurrentUser,
  DeadLetterEntry,
  ModulePayload,
  QueueEntry,
  QueuePushEntry,
  SyncError,
  SyncState,
} from "./types";
export { toSyncError, isRetryableError } from "./errorNormalizer";
export { retryAsync } from "./engine/retryAsync";

// Internal exports for tests — deliberately unstable API surface.
export { addToOfflineQueue as __internal_addToOfflineQueue } from "./queue/offlineQueue";
export { collectQueuedModules as __internal_collectQueuedModules } from "./queue/collectQueued";
