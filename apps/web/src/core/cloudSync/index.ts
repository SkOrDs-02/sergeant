// Public barrel. The original `src/core/useCloudSync.js` re-exports from
// here so existing imports and tests continue to work unchanged.
//
// Until PR #008 this barrel installed a one-time `localStorage.setItem`
// monkey-patch (`./storagePatch.ts`) that auto-fired `enqueueChange`
// for any write to a tracked sync key. The patch was removed in
// PR #008 — explicit writes go through `syncedKV` (see
// `apps/web/src/shared/lib/storage/syncedKV.ts`) and call
// {@link enqueueChange} themselves. The barrel now has no side
// effects beyond the module evaluations its re-exports trigger.

export { SYNC_EVENT, SYNC_STATUS_EVENT } from "./config";

export { getDirtyModules } from "./state/dirtyModules";
export { getOfflineQueue } from "./queue/offlineQueue";
export {
  clearDeadLetters,
  getDeadLetterCount,
  getDeadLetterEntries,
  hydrateDeadLetterFromDisk,
} from "./queue/deadLetter";

export { enqueueChange, notifySyncDirty } from "./enqueue";

export { useCloudSync } from "./hook/useCloudSync";
export { useCloudSyncDebug } from "./hook/useCloudSyncDebug";
export type { CloudSyncDebugView } from "./hook/useCloudSyncDebug";
export { useSyncStatus } from "./hook/useSyncStatus";
export {
  useSyncErrorToast,
  userFacingSyncErrorMessage,
  SYNC_ERROR_TOAST_DURATION_MS,
} from "./hook/useSyncErrorToast";
export type { CloudSyncDebugSnapshot, SyncDebugAction } from "./debugState";
export type { DeadLetterEntry, SyncError, SyncState } from "./types";
export { toSyncError, isRetryableError } from "./errorNormalizer";
export { retryAsync } from "./engine/retryAsync";

// Internal exports kept for existing tests — see useCloudSync.hardening.test.js
export { parseDateSafe as __internal_parseDateSafe } from "./conflict/parseDate";
export { isModulePushSuccess as __internal_isModulePushSuccess } from "./conflict/pushSuccess";
export { addToOfflineQueue as __internal_addToOfflineQueue } from "./queue/offlineQueue";
export { collectQueuedModules as __internal_collectQueuedModules } from "./queue/collectQueued";
