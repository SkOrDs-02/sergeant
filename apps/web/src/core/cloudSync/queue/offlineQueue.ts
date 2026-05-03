import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { MAX_OFFLINE_QUEUE, OFFLINE_QUEUE_KEY } from "../config";
import { emitStatusEvent } from "../state/events";
import type { QueueEntry, QueuePushEntry } from "../types";

export function getOfflineQueue(): QueueEntry[] {
  const q = safeReadLS<QueueEntry[]>(OFFLINE_QUEUE_KEY, []);
  return Array.isArray(q) ? q : [];
}

function isPushEntryWithModules(entry: unknown): entry is QueuePushEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as { type?: unknown; modules?: unknown };
  return e.type === "push" && !!e.modules && typeof e.modules === "object";
}

/**
 * Compare the module payload that would be produced by coalescing `nextModules`
 * into `prevModules` against `prevModules`. If the coalesce is a structural
 * no-op (same keys, same payload shape), we skip the localStorage write —
 * which fires on every `pushDirty` retry attempt against a flaky server —
 * to avoid thrash and redundant status-event emissions.
 */
function coalesceIsNoop(
  prev: QueuePushEntry["modules"],
  next: QueuePushEntry["modules"],
): boolean {
  try {
    for (const k of Object.keys(next)) {
      if (!(k in prev)) return false;
      if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Append a queue entry. Consecutive `push` entries are coalesced: new module
 * payloads are merged into the last queued push instead of appending a new
 * row. This prevents queue growth and duplicate work on replay when many
 * small changes happen while offline.
 *
 * Two additional safeguards:
 *   - If a `push` entry would be appended but earlier rows already contain
 *     stranded push entries (e.g. from an older app version or a race),
 *     those are coalesced into a single push before we decide whether to
 *     merge or append.
 *   - If the resulting merge would not change the queue at all (same
 *     payloads as the last row), we skip the write + event emission —
 *     useful during retry loops where `pushDirty.catch` keeps re-queueing
 *     the same payload every backoff.
 */
export function addToOfflineQueue(entry: Partial<QueuePushEntry>): void {
  let queue = getOfflineQueue();
  queue = normalizePushEntries(queue);

  if (
    entry &&
    entry.type === "push" &&
    entry.modules &&
    typeof entry.modules === "object" &&
    queue.length > 0
  ) {
    const last = queue[queue.length - 1];
    if (isPushEntryWithModules(last)) {
      if (coalesceIsNoop(last.modules, entry.modules)) {
        // Queue already represents the exact same payload — skip the
        // write so retry storms don't churn localStorage.
        return;
      }
      last.modules = { ...last.modules, ...entry.modules };
      last.ts = new Date().toISOString();
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

/**
 * Collapse any stranded push entries into a single trailing push row. Entries
 * of unknown types are preserved in place. In current code paths the queue
 * should already be at most one push row thanks to in-line coalescing, but
 * we still normalize defensively to heal any state left over from a previous
 * version, a multi-tab race, or manual localStorage edits.
 */
function normalizePushEntries(queue: QueueEntry[]): QueueEntry[] {
  const pushIndices: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    if (isPushEntryWithModules(queue[i])) pushIndices.push(i);
  }
  if (pushIndices.length <= 1) return queue;
  const mergedModules: QueuePushEntry["modules"] = {};
  let latestTs = "";
  for (const idx of pushIndices) {
    const e = queue[idx] as QueuePushEntry;
    Object.assign(mergedModules, e.modules);
    if (e.ts && e.ts > latestTs) latestTs = e.ts;
  }
  const next: QueueEntry[] = [];
  for (let i = 0; i < queue.length; i++) {
    if (!isPushEntryWithModules(queue[i])) next.push(queue[i]);
  }
  next.push({
    type: "push",
    modules: mergedModules,
    ts: latestTs || new Date().toISOString(),
  });
  return next;
}

export function clearOfflineQueue(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    /* swallow */
  }
  emitStatusEvent();
}
