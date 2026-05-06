/**
 * Public barrel for the (now-thin) mobile cloud-sync surface. After
 * PR #052c the v1 engine, offline-queue, dead-letter mover,
 * NetInfo-driven online tracker, error-normalizer, dirty-tracking
 * state and MMKV-backed sync metadata were dropped. PR #053c then
 * removed the no-op `enqueueChange` / `notifySyncDirty` shim and the
 * `useSyncedStorage` wrapper that depended on it — the surface left
 * is just the v1-shape stubs that `SyncStatusOverlay` /
 * `CloudSyncProvider` still consume:
 *
 *   - `useCloudSync`          — v1-shape stub hook (returns idle/no-op,
 *                                ADR-0047 client cut-over),
 *   - `useSyncStatus`         — read-only stub returning idle counts
 *                                (mobile v2 op-log writer-runtime is
 *                                not yet wired into boot path; web
 *                                counterpart lives at
 *                                `apps/web/src/core/syncEngine/`),
 *   - `CloudSyncProvider` /
 *     `useCloudSyncContext`   — context wrapper around `useCloudSync`
 *                                used by `SyncStatusOverlay.tsx`.
 *
 * Per-module SQLite dual-write adapters
 * (`apps/mobile/src/modules/{routine,fizruk,nutrition,finyk}/lib/dualWrite`)
 * now intercept mutations directly and feed the op-log v2 writer —
 * no `enqueueChange` / `useSyncedStorage` wrapping is required. See
 * `docs/planning/storage-roadmap.md` PR #053c notes for context.
 */

export { useCloudSync } from "./hook/useCloudSync";
export type { UseCloudSyncReturn } from "./hook/useCloudSync";
export { useSyncStatus } from "./hook/useSyncStatus";
export type { SyncStatusState } from "./hook/useSyncStatus";

export {
  CloudSyncContext,
  CloudSyncProvider,
  useCloudSyncContext,
} from "./CloudSyncProvider";

export type { CurrentUser, SyncError, SyncState } from "./types";
