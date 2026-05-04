/**
 * Dead-letter store for the offline queue (PR #040, storage-roadmap
 * Stage 5). Lives alongside the live queue in the shared IDB
 * `sync_meta` object store, keyed by
 * `SYNC_META_KEYS.DEAD_LETTER_QUEUE`. Entries that have failed the
 * `replayOfflineQueue` pipeline `MAX_QUEUE_ATTEMPTS` consecutive
 * times are moved here from the live queue so the live queue does
 * not retry them forever. Each `DeadLetterEntry` keeps the original
 * `QueuePushEntry` verbatim so a future manual replay can re-queue
 * it once the underlying issue is fixed.
 *
 * In-memory cache mirrors the live queue's pattern: sync getters
 * read from the cache, async writes go to IDB fire-and-forget. The
 * cache is hydrated lazily on first access via
 * `hydrateDeadLetterFromDisk` and reset on user switch via
 * `__resetDeadLetterCacheForTests` (test-only) or implicitly on
 * `clearDeadLetters`.
 */
import type { DeadLetterEntry, QueuePushEntry } from "../types";
import {
  SYNC_META_KEYS,
  delSyncMeta,
  getSyncMeta,
  setSyncMeta,
} from "../storage/syncMetaStore";

let deadLetterCache: DeadLetterEntry[] | null = null;

function getDeadLetterSync(): DeadLetterEntry[] {
  if (deadLetterCache !== null) return deadLetterCache;
  // Empty until `hydrateDeadLetterFromDisk` resolves. The in-memory
  // cache is intentionally pessimistic on cold start — dead-lettered
  // entries are not in the hot path and a one-tick delay is fine.
  deadLetterCache = [];
  return deadLetterCache;
}

function persistDeadLetter(entries: DeadLetterEntry[]): void {
  void setSyncMeta(SYNC_META_KEYS.DEAD_LETTER_QUEUE, entries);
}

/**
 * Hydrate the in-memory dead-letter cache from IDB. Idempotent —
 * subsequent calls in the same session are no-ops once the cache
 * has been populated. Must be called during boot if any consumer
 * needs the dead-letter list before the first failed replay batch.
 */
export async function hydrateDeadLetterFromDisk(): Promise<void> {
  let idb: DeadLetterEntry[] | undefined;
  try {
    idb = await getSyncMeta<DeadLetterEntry[]>(
      SYNC_META_KEYS.DEAD_LETTER_QUEUE,
    );
  } catch {
    // IDB unavailable — keep cache empty so callers see an empty list
    // instead of throwing. Dead-letter inspection is non-critical.
  }
  deadLetterCache = Array.isArray(idb) ? idb : [];
}

/**
 * Snapshot the current dead-letter list. Returns the in-memory cache
 * directly (no clone) for parity with `getOfflineQueue`. Callers must
 * not mutate; use the move/clear helpers below.
 */
export function getDeadLetterEntries(): readonly DeadLetterEntry[] {
  return getDeadLetterSync();
}

/** Convenience for dashboards/UI badges. */
export function getDeadLetterCount(): number {
  return getDeadLetterSync().length;
}

/**
 * Move a queue entry into the dead-letter store. The caller is
 * responsible for removing the entry from the live queue (this
 * helper only writes the dead-letter side). Persisted to IDB
 * fire-and-forget so the next reload sees the same dead-letter set.
 */
export function moveToDeadLetter(
  entry: QueuePushEntry,
  finalError: string,
): void {
  const list = getDeadLetterSync().slice();
  list.push({
    type: "dead-letter",
    entry,
    finalError,
    deadLetteredAt: new Date().toISOString(),
  });
  deadLetterCache = list;
  persistDeadLetter(list);
}

/**
 * Drop the entire dead-letter store. Intended for the "I've fixed
 * the underlying problem, discard the failed pushes" workflow; once
 * a manual `replayDeadLetters` ships it will move entries back into
 * the live queue first and clear them on success.
 */
export function clearDeadLetters(): void {
  deadLetterCache = [];
  void delSyncMeta(SYNC_META_KEYS.DEAD_LETTER_QUEUE);
}

/**
 * Test-only cache reset. Vitest reuses module instances across
 * describe blocks; without this, dead-letter state from one suite
 * leaks into the next.
 */
export function __resetDeadLetterCacheForTests(): void {
  deadLetterCache = null;
}
