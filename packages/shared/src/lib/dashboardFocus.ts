/**
 * Shared helpers for the dashboard "focus" layer (web + mobile).
 *
 * The Hub surfaces at most one primary recommendation (the *focus*)
 * plus a collapsed list of secondary ones (the *rest*). Both platforms
 * need the same contract for:
 *
 *  - the localStorage / MMKV key used to persist per-recommendation
 *    dismissal timestamps (`hub_recs_dismissed_v1`);
 *  - a defensive parser for that payload (legacy / corrupted storage
 *    shouldn't crash the dashboard);
 *  - filtering dismissed recs out and splitting the remainder into
 *    `{ focus, rest }`.
 *
 * Hook glue (React state, interval refreshes, MMKV subscription) lives
 * per-platform; this file is pure.
 */

import type { Rec } from "./recommendations";
import { sortRecsByPriority } from "./recommendations";

/** localStorage / MMKV key shared with the web implementation. */
export const DASHBOARD_FOCUS_DISMISSED_KEY = "hub_recs_dismissed_v1";

/** Map of `rec.id` → dismissal timestamp (epoch ms). */
export type DismissedMap = Record<string, number>;

/**
 * Safely coerce any raw storage payload (parsed JSON, cloud-synced
 * blob, user tampering) into a sanitized `DismissedMap`. Entries
 * with non-finite / negative values are dropped; anything that isn't
 * a plain object falls back to `{}`.
 */
export function normalizeDismissedMap(raw: unknown): DismissedMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DismissedMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || id.length === 0) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) continue;
    out[id] = n;
  }
  return out;
}

/**
 * Parse a JSON string pulled from storage into a `DismissedMap`.
 * Null / malformed payloads return `{}`.
 */
export function parseDismissedMap(raw: string | null): DismissedMap {
  if (raw === null) return {};
  try {
    return normalizeDismissedMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Return a new map with `id` marked as dismissed at `now`. Does not
 * mutate the input.
 */
export function addDismissal(
  map: DismissedMap,
  id: string,
  now: number = Date.now(),
): DismissedMap {
  return { ...map, [id]: now };
}

/**
 * Drop dismissed recs and preserve input order. The caller is
 * expected to have already sorted by priority if they care; this
 * helper is purely a filter so dismiss → re-filter stays O(n).
 */
export function filterVisibleRecs<T extends { id: string }>(
  recs: readonly T[],
  dismissed: DismissedMap,
): T[] {
  return recs.filter((r) => !(r.id in dismissed));
}

export interface FocusSelection<T> {
  focus: T | null;
  rest: T[];
}

/**
 * Split a pre-filtered rec list into `focus` (the head) and `rest`
 * (the tail). Matches the web `useDashboardFocus()` contract. The
 * helper does not sort — caller is responsible for ordering.
 */
export function selectFocusAndRest<T>(recs: readonly T[]): FocusSelection<T> {
  if (recs.length === 0) return { focus: null, rest: [] };
  return { focus: recs[0] ?? null, rest: recs.slice(1) };
}

/**
 * Convenience one-shot: sort by priority, strip dismissed, split into
 * focus + rest. The split that `useDashboardFocus` actually needs.
 */
export function selectDashboardFocus(
  recs: readonly Rec[],
  dismissed: DismissedMap,
): FocusSelection<Rec> {
  const sorted = sortRecsByPriority(recs);
  const visible = filterVisibleRecs(sorted, dismissed);
  return selectFocusAndRest(visible);
}
