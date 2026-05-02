// Public barrel. The original `src/core/useCloudSync.js` re-exports from
// here so existing imports and tests continue to work unchanged.
//
// Importing this barrel also triggers the localStorage patch at module load
// time (via ./storagePatch), which preserves the historical behavior where
// writes to tracked keys auto-mark the corresponding module dirty.

// Side-effect import: install the localStorage patch eagerly.
import "./storagePatch";

export { SYNC_EVENT, SYNC_STATUS_EVENT } from "./config";

export { getDirtyModules } from "./state/dirtyModules";
export { getOfflineQueue } from "./queue/offlineQueue";

export { enqueueChange, notifySyncDirty } from "./storagePatch";

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
export type { SyncError, SyncState } from "./types";
export { toSyncError, isRetryableError } from "./errorNormalizer";
export { retryAsync } from "./engine/retryAsync";

// Internal exports kept for existing tests — see useCloudSync.hardening.test.js
export { parseDateSafe as __internal_parseDateSafe } from "./conflict/parseDate";
export { isModulePushSuccess as __internal_isModulePushSuccess } from "./conflict/pushSuccess";
export { addToOfflineQueue as __internal_addToOfflineQueue } from "./queue/offlineQueue";
export { collectQueuedModules as __internal_collectQueuedModules } from "./queue/collectQueued";
