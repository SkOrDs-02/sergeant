/**
 * Weekly digest — pure storage-agnostic helpers.
 *
 * The Hub surfaces the current week's AI-generated digest in two
 * spots on the dashboard:
 *   - the full `WeeklyDigestCard` (shown inline when it's worth the
 *     real estate), and
 *   - a thin `WeeklyDigestFooter` link with a "fresh" dot.
 *
 * Both need to know the current week key, whether a digest already
 * exists for it and how to load one. The web kept these helpers
 * co-located with the `useWeeklyDigest` hook + the `WeeklyDigestCard`
 * component, which made porting them to mobile painful — they baked
 * `localStorage` straight into the call.
 *
 * This module lifts the pure bits into `@sergeant/shared`. Callers
 * inject a `StorageReader` (web: wraps `localStorage`; mobile: wraps
 * MMKV). Parity with the pre-existing web behaviour is covered by
 * `weeklyDigest.test.ts`.
 */

import { STORAGE_KEYS } from "./storageKeys";
import { deviceDayKey } from "../utils/date";

export interface WeeklyDigestRecord {
  /** ISO string or epoch ms timestamp of when the digest was generated. */
  generatedAt?: string | number;
  weekKey?: string;
  weekRange?: string;
  // Module-specific summaries live under freeform keys. We deliberately
  // keep this open so the shared helpers never parse the body; the UI
  // layer (web card) owns the per-module render contract.
  [key: string]: unknown;
}

/**
 * Thin read surface over the platform's key/value store. Intentionally
 * shaped like the `Storage` interface so `localStorage` can be passed
 * through directly. Mobile wires this to MMKV via a tiny shim.
 */
export interface StorageReader {
  getItem(key: string): string | null;
}

/** Milliseconds in 48h — how long a freshly-generated digest counts as "live". */
export const FRESH_DIGEST_AGE_MS = 48 * 60 * 60 * 1000;

/** Local YYYY-MM-DD key for a date, matching the pre-existing web format. */
function localDateKey(d: Date): string {
  return deviceDayKey(d);
}

/**
 * Resolve the ISO-week key for a given date. The key is the date of
 * the *Monday* of that week in local time, formatted as YYYY-MM-DD.
 *
 * Matches `apps/web/src/core/insights/useWeeklyDigest.ts → getWeekKey`
 * verbatim so a digest generated on web is visible on mobile (and
 * vice versa) without a migration.
 */
export function getWeekKey(d: Date = new Date()): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDateKey(monday);
}

/**
 * Build the storage key for a given week's digest. Exposed so
 * platform callers (especially test setup) can seed the store
 * directly instead of reaching into `STORAGE_KEYS` themselves.
 */
export function digestStorageKey(weekKey: string): string {
  return `${STORAGE_KEYS.WEEKLY_DIGEST_PREFIX}${weekKey}`;
}

/**
 * Load a persisted digest for the given week. Returns `null` on:
 *  - missing payload,
 *  - malformed JSON,
 *  - non-object payloads (arrays / primitives).
 *
 * Never throws.
 */
export function loadDigest(
  weekKey: string,
  storage: StorageReader,
): WeeklyDigestRecord | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(digestStorageKey(weekKey));
  } catch {
    return null;
  }
  if (raw == null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as WeeklyDigestRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Returns true when the weekly digest is "live" enough to surface on
 * the dashboard (footer fresh-dot / full card). Equivalent to the
 * web helper of the same name; see hasLiveWeeklyDigest.test.ts /
 * this file's tests for coverage of each branch.
 *
 *  - Monday is always "live" (digest can be generated today).
 *  - A digest already persisted for the current week → live.
 *  - Last week's digest, if generated within the last 48h → live.
 *  - Otherwise → not live.
 */
export function hasLiveWeeklyDigest(
  storage: StorageReader,
  now: Date = new Date(),
): boolean {
  if (now.getDay() === 1) return true;
  const wk = getWeekKey(now);
  const cur = loadDigest(wk, storage);
  if (cur) return true;
  const prev = new Date(now);
  prev.setDate(now.getDate() - 7);
  const prevDigest = loadDigest(getWeekKey(prev), storage);
  if (prevDigest?.generatedAt !== undefined) {
    const generatedAt = new Date(
      prevDigest.generatedAt as string | number,
    ).getTime();
    if (Number.isFinite(generatedAt)) {
      const ageMs = now.getTime() - generatedAt;
      if (ageMs >= 0 && ageMs <= FRESH_DIGEST_AGE_MS) return true;
    }
  }
  return false;
}
