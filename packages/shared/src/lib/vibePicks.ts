/**
 * Onboarding "vibe picks" — DOM-free helpers.
 *
 * Ported from `apps/web/src/core/onboarding/vibePicks.ts`. The original
 * file reads/writes `localStorage` directly; here we accept a
 * platform-agnostic `KVStore` so both the web adapter (localStorage)
 * and the mobile adapter (MMKV) can share the same sanitization
 * rules, key constants and normalization logic.
 *
 * The web adapter is expected to reexport these helpers under the old
 * names using a localStorage-backed `KVStore`, so no existing web
 * call-site needs to change.
 */

import type { DashboardModuleId } from "./dashboard";
import { DASHBOARD_MODULE_IDS } from "./dashboard";
import { readJSON, type KVStore, writeJSON } from "../storage/kv";

/** localStorage / MMKV keys used by the onboarding funnel. */
export const VIBE_PICKS_KEY = "hub_onboarding_vibes_v1";
export const FIRST_ACTION_PENDING_KEY = "hub_first_action_pending_v1";
export const FIRST_REAL_ENTRY_KEY = "hub_first_real_entry_done_v1";
export const SOFT_AUTH_DISMISSED_KEY = "hub_soft_auth_dismissed_v1";
export const SESSION_DAYS_KEY = "hub_session_days_v1";
export const LAST_SESSION_DAY_KEY = "hub_last_session_day_v1";
export const FIRST_ACTION_STARTED_AT_KEY = "hub_first_action_started_at_v1";
export const TTV_MS_KEY = "hub_ftux_ttv_ms_v1";

/** Canonical set of module ids accepted as a "vibe pick". */
export const ALL_MODULES: readonly DashboardModuleId[] = DASHBOARD_MODULE_IDS;

/**
 * Normalise any raw payload (JSON parse output, user input, legacy
 * schema) into a deduplicated list of known `DashboardModuleId`s.
 * Unknown ids and duplicates are dropped; preserves caller order.
 */
export function sanitizePicks(raw: unknown): DashboardModuleId[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set<string>(ALL_MODULES);
  const seen = new Set<string>();
  const out: DashboardModuleId[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    if (!known.has(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v as DashboardModuleId);
  }
  return out;
}

export function getVibePicks(store: KVStore): DashboardModuleId[] {
  return sanitizePicks(readJSON(store, VIBE_PICKS_KEY));
}

export function saveVibePicks(
  store: KVStore,
  picks: readonly DashboardModuleId[],
): void {
  writeJSON(store, VIBE_PICKS_KEY, sanitizePicks(picks));
}

export function markFirstActionPending(store: KVStore): void {
  store.setString(FIRST_ACTION_PENDING_KEY, "1");
}

export function clearFirstActionPending(store: KVStore): void {
  store.remove(FIRST_ACTION_PENDING_KEY);
}

export function isFirstActionPending(store: KVStore): boolean {
  return store.getString(FIRST_ACTION_PENDING_KEY) === "1";
}

export function markFirstRealEntryDone(store: KVStore): void {
  store.setString(FIRST_REAL_ENTRY_KEY, "1");
}

export function isFirstRealEntryDone(store: KVStore): boolean {
  return store.getString(FIRST_REAL_ENTRY_KEY) === "1";
}

export function isSoftAuthDismissed(store: KVStore): boolean {
  return store.getString(SOFT_AUTH_DISMISSED_KEY) === "1";
}

export function dismissSoftAuth(store: KVStore): void {
  store.setString(SOFT_AUTH_DISMISSED_KEY, "1");
}

/**
 * Stamp the origin of the 30-second FTUX clock. Idempotent — if a
 * timestamp is already recorded, leaves it alone so bouncing in and
 * out of /welcome doesn't reset the clock.
 */
export function markFirstActionStartedAt(
  store: KVStore,
  now: () => number = Date.now,
): void {
  if (store.getString(FIRST_ACTION_STARTED_AT_KEY)) return;
  store.setString(FIRST_ACTION_STARTED_AT_KEY, String(now()));
}

export function getFirstActionStartedAt(store: KVStore): number | null {
  const v = store.getString(FIRST_ACTION_STARTED_AT_KEY);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveTimeToValueMs(store: KVStore, ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  store.setString(TTV_MS_KEY, String(Math.round(ms)));
}

export function getTimeToValueMs(store: KVStore): number | null {
  const v = store.getString(TTV_MS_KEY);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Build a calendar-day key (`YYYY-MM-DD`) in the local timezone of the
 * provided `date`. Exposed for tests.
 */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Record a Hub session for the current calendar day. Idempotent
 * within the same day. Returns the (possibly incremented) counter
 * so callers can render conditional UI without a second read.
 */
export function recordSessionDay(
  store: KVStore,
  now: () => Date = () => new Date(),
): number {
  const key = todayKey(now());
  const last = store.getString(LAST_SESSION_DAY_KEY);
  const rawCurrent = store.getString(SESSION_DAYS_KEY);
  const current = rawCurrent === null ? 0 : Number(rawCurrent) || 0;
  if (last === key) return current;
  const next = current + 1;
  store.setString(LAST_SESSION_DAY_KEY, key);
  store.setString(SESSION_DAYS_KEY, String(next));
  return next;
}

export function getSessionDays(store: KVStore): number {
  const raw = store.getString(SESSION_DAYS_KEY);
  if (raw === null) return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
