/**
 * Web-side glue for the shared weekly-digest helpers.
 *
 * `@sergeant/shared` exposes pure `loadDigest` / `hasLiveWeeklyDigest`
 * helpers that take an injected `StorageReader` so they stay DOM-free
 * and reusable on mobile (MMKV). Web needs exactly one place that
 * adapts the real `localStorage` to that contract and returns wrapped
 * helpers with the storage argument pre-bound. Every web call-site
 * keeps its old signature after importing from here.
 */

import {
  loadDigest as sharedLoadDigest,
  hasLiveWeeklyDigest as sharedHasLiveWeeklyDigest,
  type StorageReader,
  type WeeklyDigestRecord,
} from "@sergeant/shared";

const webStorageReader: StorageReader = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
};

export function loadDigest(weekKey: string): WeeklyDigestRecord | null {
  return sharedLoadDigest(weekKey, webStorageReader);
}

export function hasLiveWeeklyDigest(now: Date = new Date()): boolean {
  return sharedHasLiveWeeklyDigest(webStorageReader, now);
}

export type { WeeklyDigestRecord };
