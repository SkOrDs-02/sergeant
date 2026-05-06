/**
 * Public barrel for the remaining web sync status surface.
 *
 * CloudSync v1 network clients, orchestrators, toast plumbing, and enqueue
 * shims are gone. v2 writer runtime owns transport; UI reads status through
 * `useSyncStatus`.
 */

export { useSyncStatus } from "./hook/useSyncStatus";
