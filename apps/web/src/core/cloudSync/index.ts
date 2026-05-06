/**
 * Public barrel for the (now-thin) cloudSync surface. After PR #053a
 * the directory carries only what App.tsx / OfflineBanner still depend on:
 *
 *   - `useCloudSync`            — v1-shape stub hook (returns idle/no-op,
 *                                  ADR-0047 client cut-over),
 *   - `useSyncStatus`           — v2 outbox-counter mirror used by
 *                                  `OfflineBanner.tsx`,
 *   - `useSyncErrorToast` etc.  — toast surface for v2 errors (still
 *                                  shaped via `SyncError`).
 *
 * The v1 engine, offline-queue, dirty-tracking, dead-letter mover,
 * conflict resolver, error-normalizer and SPA debug hook all dropped
 * in PR #052b — see `docs/planning/storage-roadmap.md`. The
 * `enqueueChange` no-op shim and the `syncedKV` factory wrapper that
 * depended on it dropped in PR #053a (KVStore deprecate, web phase).
 */

export { useCloudSync } from "./hook/useCloudSync";
export { useSyncStatus } from "./hook/useSyncStatus";
export {
  useSyncErrorToast,
  userFacingSyncErrorMessage,
  SYNC_ERROR_TOAST_DURATION_MS,
} from "./hook/useSyncErrorToast";

export type { CurrentUser, SyncError, SyncState } from "./types";
