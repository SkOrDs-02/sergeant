/**
 * Public barrel for the (now-thin) cloudSync surface. After PR #052b
 * the directory carries only what App.tsx / OfflineBanner / syncedKV
 * still depend on:
 *
 *   - `useCloudSync`            — v1-shape stub hook (returns idle/no-op,
 *                                  ADR-0047 client cut-over),
 *   - `useSyncStatus`           — v2 outbox-counter mirror used by
 *                                  `OfflineBanner.tsx`,
 *   - `useSyncErrorToast` etc.  — toast surface for v2 errors (still
 *                                  shaped via `SyncError`),
 *   - `enqueueChange` (no-op)   — kept so `syncedKV` keeps compiling
 *                                  until KVStore deprecation (PR #053).
 *
 * The v1 engine, offline-queue, dirty-tracking, dead-letter mover,
 * conflict resolver, error-normalizer and SPA debug hook all dropped
 * here — see PR #052b notes in `docs/planning/storage-roadmap.md`.
 */

export { useCloudSync } from "./hook/useCloudSync";
export { useSyncStatus } from "./hook/useSyncStatus";
export {
  useSyncErrorToast,
  userFacingSyncErrorMessage,
  SYNC_ERROR_TOAST_DURATION_MS,
} from "./hook/useSyncErrorToast";

export type { CurrentUser, SyncError, SyncState } from "./types";

export { enqueueChange, notifySyncDirty } from "./enqueue";
