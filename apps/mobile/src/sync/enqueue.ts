/**
 * `enqueueChange` — historical entry point that v1 cloudSync used to
 * mark a module dirty and dispatch `SYNC_EVENT` so the scheduler layer
 * could debounce a push. Per [ADR-0047] the v1 channel is `410 Gone`
 * since 2026-05-06 and the engine that consumed this signal was
 * removed in PR #052c. The function now no-ops.
 *
 * Why kept at all? Mobile module hooks (routine / fizruk / nutrition /
 * finyk) call this after every persisted MMKV mutation — there is no
 * `localStorage.setItem`-style global hook on RN, so each store must
 * call `enqueueChange(key)` explicitly. Decoupling that contract from
 * 17+ call-sites is a follow-up change-set (PR #053 `chore: deprecate
 * KVStore in favor of SQLite-backed cache`); until that lands the
 * callers keep firing this but nothing downstream listens.
 *
 * v2 op-log capture happens through the per-module SQLite dual-write
 * adapters (`apps/mobile/src/modules/{routine,fizruk,nutrition,finyk}/lib/dualWrite`
 * and the corresponding op-log helpers in
 * `packages/db-schema/src/sqlite/syncOpOutbox*.ts`). Those adapters do
 * **not** rely on this hook.
 *
 * [ADR-0047]: ../../../../../docs/adr/0047-cloudsync-v1-410-gone.md
 */
export function enqueueChange(_changedKey?: string): void {
  /* no-op — v1 engine sunset per ADR-0047 + PR #052c */
}

/**
 * Backward-compatibility alias. Pre-PR-#052c `enqueueChange` and
 * `notifySyncDirty` had different jobs (the latter could be called
 * without a value to write); after the cleanup they share the same
 * no-op implementation, but downstream call sites still import either
 * name from `@/sync/enqueue` so the alias stays.
 */
export const notifySyncDirty = enqueueChange;
