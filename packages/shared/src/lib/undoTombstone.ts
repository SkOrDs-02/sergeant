/**
 * Undo tombstones — DOM-free, KVStore-backed.
 *
 * Companion to `showUndoToast()` for the rare case where the user might
 * navigate away or reload during the 5–7 s undo window. Without a
 * tombstone, the in-memory snapshot vanishes when the component
 * unmounts and the soft-delete becomes immediately irreversible —
 * which contradicts the "every soft-delete is undoable" rule (see
 * `docs/playbooks/undo-toast.md` if/when written).
 *
 * Usage pattern in a host component:
 *
 * ```ts
 * const tombstone: HabitTombstone = { id, deletedAt: Date.now(), data: habit };
 * writeTombstone(store, "routine_habits_v1", tombstone);
 * showUndoToast(toast, {
 *   msg: `Видалено звичку «${habit.name}»`,
 *   onUndo: () => {
 *     restoreHabit(habit);
 *     clearTombstone(store, "routine_habits_v1", id);
 *   },
 * });
 * // After 5 s the toast self-dismisses; the tombstone is purged on
 * // next mount via `purgeExpiredTombstones()`.
 * ```
 *
 * Tombstones are not a permanent trash bin — they exist solely to keep
 * the undo path safe across unmount/reload. The `expiresAt` window
 * matches the toast duration; anything older is purged on the next
 * mount of the host that owns the tombstone bucket.
 */

import { readJSON, writeJSON, type KVStore } from "./kvStore";

/** Default tombstone window — slightly longer than the 5 s toast so
 *  reload-mid-toast still has a chance to call undo. */
export const DEFAULT_TOMBSTONE_TTL_MS = 7_000;

/**
 * Stored tombstone — `data` is opaque to this lib; consumers downcast
 * it to their domain type when they read it back.
 */
export interface UndoTombstone<T = unknown> {
  /** Stable id of the soft-deleted entity (habit id, transaction id, etc.). */
  id: string;
  /** Epoch ms when the soft-delete occurred. */
  deletedAt: number;
  /** Epoch ms after which the tombstone is treated as expired. */
  expiresAt: number;
  /** Snapshot the consumer needs to fully restore the entity. */
  data: T;
}

interface TombstoneMap<T = unknown> {
  [id: string]: UndoTombstone<T>;
}

function readMap<T>(store: KVStore, bucketKey: string): TombstoneMap<T> {
  return readJSON<TombstoneMap<T>>(store, bucketKey) ?? {};
}

/**
 * Write (or replace) a tombstone in the given bucket. Returns the
 * stored tombstone with its computed `expiresAt`.
 */
export function writeTombstone<T>(
  store: KVStore,
  bucketKey: string,
  entry: { id: string; data: T; ttlMs?: number },
  now?: Date,
): UndoTombstone<T> {
  const map = readMap<T>(store, bucketKey);
  const ts = (now ?? new Date()).getTime();
  const ttl = entry.ttlMs ?? DEFAULT_TOMBSTONE_TTL_MS;
  const tombstone: UndoTombstone<T> = {
    id: entry.id,
    deletedAt: ts,
    expiresAt: ts + ttl,
    data: entry.data,
  };
  map[entry.id] = tombstone;
  writeJSON(store, bucketKey, map);
  return tombstone;
}

/** Look up a tombstone, ignoring expired entries. */
export function readTombstone<T>(
  store: KVStore,
  bucketKey: string,
  id: string,
  now?: Date,
): UndoTombstone<T> | null {
  const map = readMap<T>(store, bucketKey);
  const tombstone = map[id];
  if (!tombstone) return null;
  const nowMs = (now ?? new Date()).getTime();
  if (tombstone.expiresAt <= nowMs) return null;
  return tombstone;
}

/** Drop a single tombstone — call after a successful restore so it
 *  isn't re-applied on the next mount. */
export function clearTombstone(
  store: KVStore,
  bucketKey: string,
  id: string,
): void {
  const map = readMap(store, bucketKey);
  if (!(id in map)) return;
  delete map[id];
  writeJSON(store, bucketKey, map);
}

/** Remove all expired entries. Call once on mount of the host that
 *  owns the bucket; cheap (single read + at most one write). */
export function purgeExpiredTombstones(
  store: KVStore,
  bucketKey: string,
  now?: Date,
): void {
  const map = readMap(store, bucketKey);
  const nowMs = (now ?? new Date()).getTime();
  let dirty = false;
  for (const id of Object.keys(map)) {
    if (map[id].expiresAt <= nowMs) {
      delete map[id];
      dirty = true;
    }
  }
  if (dirty) writeJSON(store, bucketKey, map);
}
