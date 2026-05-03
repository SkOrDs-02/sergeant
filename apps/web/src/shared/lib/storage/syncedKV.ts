/**
 * Web-side singleton + helpers for the explicit, sync-aware KV store.
 *
 * `syncedKV` wraps `webKVStore` (raw `localStorage` adapter) with
 * `createSyncedKVStore` from `@sergeant/shared`, wired against the
 * cloud-sync `enqueueChange` callback and the cross-platform
 * `ALL_TRACKED_KEYS` registry. It is the explicit replacement for
 * the `localStorage.setItem` monkey-patch that lived at
 * `apps/web/src/core/cloudSync/storagePatch.ts` before PR #008.
 *
 * Use the hook-shaped `safeWriteSyncedLS` / `safeRemoveSyncedLS`
 * helpers below as drop-in replacements for `safeWriteLS` /
 * `safeRemoveLS` whenever the storage key is registered in
 * `SYNC_MODULES` (see `@sergeant/shared/sync/modules`). Untracked
 * keys keep using the regular `safeWriteLS` from `./storage` — calling
 * the synced helpers for an untracked key is a no-op for sync
 * (the `isTracked` guard short-circuits) but adds an unnecessary
 * indirection to read.
 *
 * The codemod at `scripts/codemods/syncedKV.mjs` automates the
 * `safeWriteLS(STORAGE_KEYS.X, …)` → `safeWriteSyncedLS(...)` swap
 * for every tracked key under `apps/web/src`. Run it after adding
 * a new sync-tracked module to keep new write sites consistent.
 */
import { ALL_TRACKED_KEYS, createSyncedKVStore } from "@sergeant/shared";
import type { KVStore } from "@sergeant/shared";

import { enqueueChange } from "../../../core/cloudSync/enqueue";

import { webKVStore } from "./storage";

/**
 * Singleton wrapper around `webKVStore` that auto-fires `enqueueChange`
 * after every `setString` / `remove` on a sync-tracked key. Use it
 * directly when you already have the value as a string; otherwise
 * prefer {@link safeWriteSyncedLS} / {@link safeRemoveSyncedLS} below.
 */
export const syncedKV: KVStore = createSyncedKVStore(webKVStore, {
  onChange: enqueueChange,
  isTracked: (key) => ALL_TRACKED_KEYS.has(key),
});

/**
 * Drop-in replacement for {@link safeWriteLS} for sync-tracked keys.
 * JSON-serializes non-string values, swallows quota / private-mode
 * errors, and returns whether the underlying write succeeded. After
 * a successful write, `enqueueChange(key)` fires exactly once for
 * tracked keys (no-op for untracked keys, but the call is still
 * cheap — see `createSyncedKVStore`).
 */
export function safeWriteSyncedLS(key: string, value: unknown): boolean {
  try {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);
    syncedKV.setString(key, serialized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop-in replacement for `localStorage.removeItem` for sync-tracked
 * keys. Triggers `enqueueChange(key)` after the underlying delete on
 * tracked keys. Untracked keys still get removed but do not fire the
 * sync callback.
 */
export function safeRemoveSyncedLS(key: string): boolean {
  try {
    syncedKV.remove(key);
    return true;
  } catch {
    return false;
  }
}
