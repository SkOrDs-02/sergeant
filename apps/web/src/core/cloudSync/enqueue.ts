/**
 * `enqueueChange` — historical entry point that v1 cloudSync used to
 * mark a module dirty and dispatch `SYNC_EVENT` so the scheduler layer
 * could debounce a push. Per [ADR-0047] the v1 channel is `410 Gone`
 * since 2026-05-06 and the engine that consumed this signal was
 * removed in PR #052b. The function now no-ops.
 *
 * Why kept at all? `apps/web/src/shared/lib/storage/syncedKV.ts`
 * passes this as the `onChange` callback to the shared
 * `createSyncedKVStore` factory. Decoupling that contract is a
 * separate change-set (PR #053 `chore: deprecate KVStore in favor of
 * SQLite-backed cache`) — until that lands, callers keep firing this
 * but nothing downstream listens.
 *
 * v2 op-log capture happens through the syncEngine writer
 * (`apps/web/src/core/syncEngine/syncEngineWriter.ts`), which intercepts
 * SQLite mutations directly and persists them in `sync_op_outbox`. It
 * does **not** rely on this hook.
 *
 * [ADR-0047]: ../../../../../../docs/adr/0047-cloudsync-v1-410-gone.md
 */
export function enqueueChange(_changedKey?: string): void {
  /* no-op — v1 engine sunset per ADR-0047 + PR #052b */
}

/**
 * Backward-compatibility alias. Pre-PR-#052b `enqueueChange` and
 * `notifySyncDirty` had different jobs (the latter could be called
 * without a value to write); after the cleanup they share the same
 * no-op implementation, but downstream call sites still import either
 * name from `@core/cloudSync` so the alias stays.
 */
export const notifySyncDirty = enqueueChange;
