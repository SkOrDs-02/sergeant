/**
 * Mobile weekly-digest storage adapter.
 *
 * Binds the DOM-free helpers from `@sergeant/shared` (see
 * `packages/shared/src/lib/weeklyDigest.ts`) to the MMKV-backed
 * storage used by the rest of the mobile app.
 *
 * The shared helpers own the parsing, Monday-based week-key
 * calculation, 48h freshness window, and error-swallowing semantics
 * so this file stays a thin wiring shim — web has the matching
 * adapter at `apps/web/src/shared/lib/storage/weeklyDigestStorage.ts`.
 */

import {
  digestStorageKey,
  loadDigest as sharedLoadDigest,
  hasLiveWeeklyDigest as sharedHasLiveWeeklyDigest,
  type StorageReader,
  type WeeklyDigestRecord,
} from "@sergeant/shared";

import { safeReadStringLS, safeWriteLS } from "@/lib/storage";

/**
 * `StorageReader` shim over MMKV. The shared helper expects raw
 * strings (so it can parse them into a record with its own error
 * handling) — `safeReadStringLS` returns `null` on any read failure,
 * matching web's `localStorage.getItem` contract.
 */
const mobileStorageReader: StorageReader = {
  getItem(key) {
    return safeReadStringLS(key);
  },
};

/** Thin wrapper — callers can forget about the reader instance. */
export function loadDigest(weekKey: string): WeeklyDigestRecord | null {
  return sharedLoadDigest(weekKey, mobileStorageReader);
}

/**
 * True when the current weekly digest is "live" enough to warrant
 * prominent surfacing on the hub. See the shared helper for the
 * detailed rules (Monday / current-week digest / 48h prev-week
 * digest).
 */
export function hasLiveWeeklyDigest(now: Date = new Date()): boolean {
  return sharedHasLiveWeeklyDigest(mobileStorageReader, now);
}

export function saveDigest(weekKey: string, data: unknown): void {
  safeWriteLS(digestStorageKey(weekKey), data);
}

export type { WeeklyDigestRecord };
