/**
 * Mobile dead-letter store for the offline queue (PR #040,
 * storage-roadmap Stage 5). 1:1 behavioral mirror of
 * `apps/web/src/core/cloudSync/queue/deadLetter.ts`, but backed by
 * the shared `@/lib/storage` MMKV adapter rather than IDB. Entries
 * moved here are entries that have failed the
 * `replayOfflineQueue` pipeline `MAX_QUEUE_ATTEMPTS` consecutive
 * times — see the per-entry docstrings in `../types.ts`.
 *
 * Mobile is sync-only on the storage side (MMKV is synchronous), so
 * we don't need the in-memory cache pattern web uses to bridge sync
 * callers over async IDB reads. Reads + writes go straight through
 * the storage adapter, which keeps the API small and predictable.
 */
import { safeReadLS, safeRemoveLS, safeWriteLS } from "@/lib/storage";
import { DEAD_LETTER_QUEUE_KEY } from "../config";
import type { DeadLetterEntry, QueuePushEntry } from "../types";

function readDeadLetterList(): DeadLetterEntry[] {
  const raw = safeReadLS<DeadLetterEntry[]>(DEAD_LETTER_QUEUE_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

/** Snapshot the current dead-letter list. */
export function getDeadLetterEntries(): readonly DeadLetterEntry[] {
  return readDeadLetterList();
}

/** Convenience for badges / debug surfaces. */
export function getDeadLetterCount(): number {
  return readDeadLetterList().length;
}

/**
 * Move a queue entry into the dead-letter store. The caller is
 * responsible for removing the entry from the live queue (this
 * helper only writes the dead-letter side). Persisted to MMKV
 * synchronously — survives app restarts via the same MMKV instance
 * the rest of the sync subsystem uses.
 */
export function moveToDeadLetter(
  entry: QueuePushEntry,
  finalError: string,
): void {
  const list = readDeadLetterList();
  list.push({
    type: "dead-letter",
    entry,
    finalError,
    deadLetteredAt: new Date().toISOString(),
  });
  safeWriteLS(DEAD_LETTER_QUEUE_KEY, list);
}

/** Drop the entire dead-letter store. */
export function clearDeadLetters(): void {
  safeRemoveLS(DEAD_LETTER_QUEUE_KEY);
}
