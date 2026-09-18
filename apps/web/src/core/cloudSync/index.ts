/**
 * Public barrel for the remaining web sync status surface.
 *
 * CloudSync v1 network clients, orchestrators, toast plumbing, and enqueue
 * shims are gone. v2 writer runtime owns transport; UI reads status through
 * `useSyncStatus`.
 *
 * @scaffolded
 * @nextStep Migrate `useSyncStatus` call-sites from
 *   `@core/cloudSync/hook/useSyncStatus` deep-import to barrel
 *   `@core/cloudSync`. Tracked in dead-code roast 2026-05-13.
 */

export { useSyncStatus } from "./hook/useSyncStatus";
