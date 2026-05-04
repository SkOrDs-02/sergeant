/**
 * Mobile offline-queue primitive. Identical semantics to the web
 * version at `apps/web/src/core/cloudSync/queue/offlineQueue.ts`:
 *
 *   - queue is a flat array of `{type: "push", ts, modules}` rows
 *   - consecutive push rows are coalesced — newer module payloads
 *     merge into the last queued push instead of appending a new row
 *   - length is capped at `MAX_OFFLINE_QUEUE`; older rows are dropped
 *     to keep MMKV usage bounded for extended offline periods
 *
 * Backed by MMKV through the shared `@/lib/storage` adapter.
 */
import { MAX_QUEUE_ATTEMPTS } from "@sergeant/shared";
import { safeReadLS, safeRemoveLS, safeWriteLS } from "@/lib/storage";
import { MAX_OFFLINE_QUEUE, OFFLINE_QUEUE_KEY } from "../config";
import { emitStatusEvent } from "../events";
import type { QueueEntry, QueuePushEntry } from "../types";
import { moveToDeadLetter } from "./deadLetter";

export function getOfflineQueue(): QueueEntry[] {
  const q = safeReadLS<QueueEntry[]>(OFFLINE_QUEUE_KEY, []);
  return Array.isArray(q) ? q : [];
}

export function addToOfflineQueue(entry: Partial<QueuePushEntry>): void {
  let queue = getOfflineQueue();
  if (
    entry &&
    entry.type === "push" &&
    entry.modules &&
    typeof entry.modules === "object" &&
    queue.length > 0
  ) {
    const last = queue[queue.length - 1];
    if (
      last &&
      last.type === "push" &&
      last.modules &&
      typeof last.modules === "object"
    ) {
      last.modules = { ...last.modules, ...entry.modules };
      last.ts = new Date().toISOString();
      // PR #040 — preserve `attemptCount` / `lastError` / `lastAttemptAt`
      // across coalesce. New module data merging into a stranded entry
      // should NOT reset its retry budget; the reason we're enqueuing
      // again is the same reason the previous batch failed.
      safeWriteLS(OFFLINE_QUEUE_KEY, queue);
      emitStatusEvent();
      return;
    }
  }
  queue.push({
    ...(entry as QueuePushEntry),
    ts: new Date().toISOString(),
  });
  if (queue.length > MAX_OFFLINE_QUEUE) {
    queue = queue.slice(queue.length - MAX_OFFLINE_QUEUE);
  }
  safeWriteLS(OFFLINE_QUEUE_KEY, queue);
  emitStatusEvent();
}

export function clearOfflineQueue(): void {
  safeRemoveLS(OFFLINE_QUEUE_KEY);
  emitStatusEvent();
}

/**
 * PR #040 — record a failed replay batch against every entry in the
 * live queue. Bumps each entry's `attemptCount`, stamps the latest
 * `lastError` / `lastAttemptAt`, and moves any entry whose attempt
 * count has reached `MAX_QUEUE_ATTEMPTS` into the dead-letter store.
 *
 * Returns the number of entries dead-lettered by this call (0 most
 * of the time; ≥1 only on the cycle where the threshold trips).
 * Mirrors web behavior so cross-platform sync diagnostics stay
 * apples-to-apples.
 */
export function recordReplayBatchFailure(error: unknown): number {
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date().toISOString();
  const survivors: QueueEntry[] = [];
  let deadLettered = 0;
  for (const entry of queue) {
    if (!entry || entry.type !== "push") {
      survivors.push(entry);
      continue;
    }
    const nextAttempts = (entry.attemptCount ?? 0) + 1;
    const updated: QueuePushEntry = {
      ...entry,
      attemptCount: nextAttempts,
      lastError: message,
      lastAttemptAt: now,
    };
    if (nextAttempts >= MAX_QUEUE_ATTEMPTS) {
      moveToDeadLetter(updated, message);
      deadLettered += 1;
      continue;
    }
    survivors.push(updated);
  }
  safeWriteLS(OFFLINE_QUEUE_KEY, survivors);
  emitStatusEvent();
  return deadLettered;
}
