/**
 * Public barrel for the remaining mobile sync status surface.
 *
 * CloudSync v1 network clients, provider context, enqueue shims, and
 * `useSyncedStorage` wrappers are gone. Per-module dual-write adapters
 * feed the v2 op-log directly; UI reads status through `useSyncStatus`.
 */

export { useSyncStatus } from "./hook/useSyncStatus";
export type { SyncStatusState } from "./hook/useSyncStatus";
