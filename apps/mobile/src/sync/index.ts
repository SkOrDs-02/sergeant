/**
 * Public barrel for the (now-thin) mobile cloud-sync surface. After
 * PR #052c the directory carries only what `CloudSyncProvider`,
 * `SyncStatusIndicator`, `SyncStatusOverlay`, `useSyncedStorage` and
 * the 17+ module-store call-sites still depend on:
 *
 *   - `useCloudSync`          — v1-shape stub hook (returns idle/no-op,
 *                                ADR-0047 client cut-over),
 *   - `useSyncStatus`         — read-only stub returning idle counts
 *                                (mobile v2 op-log writer-runtime is
 *                                not yet wired into boot path; web
 *                                counterpart lives at
 *                                `apps/web/src/core/syncEngine/`),
 *   - `useSyncedStorage`      — `useLocalStorage` + `enqueueChange`
 *                                (no-op) wrapper для tracked sync keys,
 *   - `enqueueChange`         — no-op (kept so 17+ module hooks stay
 *                                green; PR #053 KVStore deprecation
 *                                will remove the call-sites),
 *   - `CloudSyncProvider` /
 *     `useCloudSyncContext`   — context wrapper around `useCloudSync`
 *                                used by `SyncStatusOverlay.tsx`.
 *
 * The v1 engine, offline-queue, dead-letter mover, NetInfo-driven
 * online tracker, error-normalizer, dirty-tracking state, MMKV-backed
 * sync metadata and всі engine-tests дерева dropped here — see PR
 * #052c notes in `docs/planning/storage-roadmap.md`.
 */

export { useCloudSync } from "./hook/useCloudSync";
export type { UseCloudSyncReturn } from "./hook/useCloudSync";
export { useSyncStatus } from "./hook/useSyncStatus";
export type { SyncStatusState } from "./hook/useSyncStatus";

export { useSyncedStorage } from "./useSyncedStorage";

export {
  CloudSyncContext,
  CloudSyncProvider,
  useCloudSyncContext,
} from "./CloudSyncProvider";

export type { CurrentUser, SyncError, SyncState } from "./types";

export { enqueueChange, notifySyncDirty } from "./enqueue";
