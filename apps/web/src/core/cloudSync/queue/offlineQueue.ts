import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { MAX_OFFLINE_QUEUE, OFFLINE_QUEUE_KEY } from "../config";
import { emitStatusEvent } from "../state/events";
import {
  SYNC_META_KEYS,
  delSyncMeta,
  getSyncMeta,
  setSyncMeta,
} from "../storage/syncMetaStore";
import type { QueueEntry, QueuePushEntry } from "../types";

/**
 * Sync source of truth for the queue. Backing store is IDB
 * (`syncMetaStore.ts`); IDB writes are fire-and-forget so existing
 * sync callers (`addToOfflineQueue`, `getOfflineQueue`, …) keep their
 * contract. LS dual-write remains as a best-effort backup so the
 * first sync read after a cold boot can hydrate from LS without
 * waiting on the async IDB read; `hydrateOfflineQueueFromDisk()`
 * upgrades the cache once IDB resolves.
 *
 * `null` means "not yet hydrated" — the first sync caller triggers a
 * synchronous LS read to populate it.
 */
let queueCache: QueueEntry[] | null = null;

function getQueueSync(): QueueEntry[] {
  if (queueCache !== null) return queueCache;
  const ls = safeReadLS<QueueEntry[]>(OFFLINE_QUEUE_KEY, []);
  queueCache = Array.isArray(ls) ? ls : [];
  return queueCache;
}

/**
 * Above this length we stop dual-writing the queue to localStorage.
 * IDB is authoritative once the queue grows past what LS can hold
 * (~5 MB / a few hundred entries depending on payload size); past
 * the threshold the LS row is intentionally stale, kept only as a
 * "is there anything queued?" marker for legacy readers. Skipping
 * the write also avoids O(N) JSON.stringify churn on every
 * `addToOfflineQueue` once the queue grows long.
 */
const LS_DUAL_WRITE_MAX_ENTRIES = 100;

function persistQueue(queue: QueueEntry[]): void {
  // IDB is the durable answer (no quota cap). LS dual-write is best-
  // effort and only happens for small queues; once we cross
  // `LS_DUAL_WRITE_MAX_ENTRIES`, IDB is the sole source and LS will
  // appear stale until the queue drains below the threshold again.
  // `safeWriteLS` swallows QuotaExceededError so this is a no-op when
  // the browser's LS budget is exhausted.
  void setSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE, queue);
  if (queue.length <= LS_DUAL_WRITE_MAX_ENTRIES) {
    safeWriteLS(OFFLINE_QUEUE_KEY, queue);
  }
}

export function getOfflineQueue(): QueueEntry[] {
  return getQueueSync();
}

/**
 * Async hydration step — meant to be called once during boot, before
 * the first reconnect/replay. Reconciles in-memory cache with IDB:
 * if IDB has data, it wins (durable source); if IDB is empty but LS
 * has legacy data, we migrate it into IDB and clear LS.
 *
 * Idempotent: subsequent calls are no-ops if the cache already matches
 * the IDB row.
 */
export async function hydrateOfflineQueueFromDisk(): Promise<void> {
  let idb: QueueEntry[] | undefined;
  try {
    idb = await getSyncMeta<QueueEntry[]>(SYNC_META_KEYS.OFFLINE_QUEUE);
  } catch {
    // IDB unavailable (Safari Private Browsing, disabled, quota) —
    // fall through to the LS path below so the cache still warms up.
  }
  if (Array.isArray(idb) && idb.length > 0) {
    queueCache = idb;
    return;
  }
  const ls = safeReadLS<QueueEntry[]>(OFFLINE_QUEUE_KEY, []);
  if (Array.isArray(ls) && ls.length > 0) {
    queueCache = ls;
    // One-shot migration LS → IDB so future cold-boots use IDB and the
    // ~5 MB LS cap stops gating queue size. We deliberately keep LS
    // populated for the next dual-write — it'll be overwritten on the
    // first `addToOfflineQueue` call anyway.
    try {
      await setSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE, ls);
    } catch {
      /* IDB unavailable — fine, LS continues to back the queue. */
    }
    return;
  }
  queueCache = [];
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
  let queue = getQueueSync();

  const isPush =
    !!entry &&
    entry.type === "push" &&
    !!entry.modules &&
    typeof entry.modules === "object";

  if (isPush) {
    // Only normalize for push entries — `normalizePushEntries` does an
    // O(N) scan of the queue and is only meaningful when we're about
    // to coalesce. Skipping it for non-push entries keeps the per-call
    // cost O(1) even when the queue holds many thousand events.
    queue = normalizePushEntries(queue);
    if (queue.length > 0) {
      const last = queue[queue.length - 1];
      if (isPushEntryWithModules(last)) {
        if (coalesceIsNoop(last.modules, entry.modules!)) {
          // Queue already represents the exact same payload — skip the
          // write so retry storms don't churn storage.
          return;
        }
        last.modules = { ...last.modules, ...entry.modules! };
        last.ts = new Date().toISOString();
        queueCache = queue;
        persistQueue(queue);
        emitStatusEvent();
        return;
      }
    }
  }
  queue.push({
    ...(entry as QueuePushEntry),
    ts: new Date().toISOString(),
  });
  if (queue.length > MAX_OFFLINE_QUEUE) {
    queue = queue.slice(queue.length - MAX_OFFLINE_QUEUE);
  }
  queueCache = queue;
  persistQueue(queue);
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
  queueCache = [];
  void delSyncMeta(SYNC_META_KEYS.OFFLINE_QUEUE);
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {
    /* swallow */
  }
  emitStatusEvent();
}

/**
 * Test-only cache reset. Vitest reuses module instances across
 * describe blocks; without this, a queue populated by an earlier
 * suite leaks into the next one.
 */
export function __resetOfflineQueueCacheForTests(): void {
  queueCache = null;
}
