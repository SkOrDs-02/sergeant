/**
 * Daily nudges & re-engagement — DOM-free logic.
 *
 * Phase 3 of the onboarding plan: contextual daily messages for
 * the first 7 days and a "welcome back" card after 7+ days of
 * inactivity. State is persisted via KVStore.
 */

import type { DashboardModuleId } from "./dashboard";
import { readJSON, writeJSON, type KVStore } from "./kvStore";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const NUDGE_DISMISSED_KEY = "hub_nudge_dismissed_v1";
const NUDGE_SNOOZE_KEY = "hub_nudge_snooze_v1";
const LAST_ACTIVE_DATE_KEY = "hub_last_active_date_v1";
const REENGAGEMENT_SHOWN_KEY = "hub_reengagement_shown_v1";

// ---------------------------------------------------------------------------
// Daily nudge definitions
// ---------------------------------------------------------------------------

export interface NudgeDefinition {
  id: string;
  day: number;
  message: string;
  /** Which module the nudge relates to (for conditional display). */
  conditionModule?: DashboardModuleId;
  /** If true, show only when the condition module has no entries yet. */
  conditionEmpty?: boolean;
}

const NUDGE_CATALOG: readonly NudgeDefinition[] = [
  {
    id: "day2_routine",
    day: 2,
    message: "Вчора ти зробив перший запис. Сьогодні — створи звичку?",
    conditionModule: "routine",
    conditionEmpty: true,
  },
  {
    id: "day3_chat",
    day: 3,
    message: "3 дні з Sergeant! Спробуй AI-чат для плану на день.",
  },
  {
    id: "day5_analytics",
    day: 5,
    message: "Тижнева аналітика доступна, як тільки будуть дані за 5+ днів.",
  },
  {
    id: "day7_digest",
    day: 7,
    message: "Тиждень! Подивись свій перший дайджест.",
  },
];

// ---------------------------------------------------------------------------
// Nudge state
// ---------------------------------------------------------------------------

interface NudgeDismissedMap {
  [nudgeId: string]: boolean;
}

function getDismissedMap(store: KVStore): NudgeDismissedMap {
  return readJSON<NudgeDismissedMap>(store, NUDGE_DISMISSED_KEY) ?? {};
}

export function dismissNudge(store: KVStore, nudgeId: string): void {
  const map = getDismissedMap(store);
  map[nudgeId] = true;
  writeJSON(store, NUDGE_DISMISSED_KEY, map);
}

interface NudgeSnoozeMap {
  /** Epoch ms after which the nudge becomes eligible again. */
  [nudgeId: string]: number;
}

function getSnoozeMap(store: KVStore): NudgeSnoozeMap {
  return readJSON<NudgeSnoozeMap>(store, NUDGE_SNOOZE_KEY) ?? {};
}

/**
 * Hide a nudge for `days` days. Unlike `dismissNudge`, the nudge becomes
 * eligible again after the snooze window. Used to give users a "remind
 * me later" escape hatch from the daily nudge stream without losing the
 * tip permanently.
 */
export function snoozeNudge(
  store: KVStore,
  nudgeId: string,
  days: number,
  now?: Date,
): void {
  const map = getSnoozeMap(store);
  const ts = (now ?? new Date()).getTime() + days * 24 * 60 * 60 * 1000;
  map[nudgeId] = ts;
  writeJSON(store, NUDGE_SNOOZE_KEY, map);
}

function isSnoozed(map: NudgeSnoozeMap, nudgeId: string, now?: Date): boolean {
  const expiresAt = map[nudgeId];
  if (typeof expiresAt !== "number") return false;
  const nowMs = (now ?? new Date()).getTime();
  return expiresAt > nowMs;
}

/**
 * Pick the single nudge to show today (max 1 per day).
 * Returns null if no nudge is applicable or all have been dismissed.
 */
export function getActiveNudge(
  store: KVStore,
  sessionDays: number,
  opts?: {
    /** Module IDs the user picked during onboarding. */
    picks?: readonly string[];
    /** Module IDs that have at least one real entry. */
    modulesWithEntries?: ReadonlySet<string>;
  },
): NudgeDefinition | null {
  if (sessionDays < 2 || sessionDays > 7) return null;

  const dismissed = getDismissedMap(store);
  const snoozed = getSnoozeMap(store);

  for (const nudge of NUDGE_CATALOG) {
    if (nudge.day > sessionDays) continue;
    if (dismissed[nudge.id]) continue;
    if (isSnoozed(snoozed, nudge.id)) continue;

    if (nudge.conditionModule) {
      const picks = opts?.picks;
      if (picks && !picks.includes(nudge.conditionModule)) continue;
      if (
        nudge.conditionEmpty &&
        opts?.modulesWithEntries?.has(nudge.conditionModule)
      ) {
        continue;
      }
    }

    return nudge;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Re-engagement
// ---------------------------------------------------------------------------

function todayKey(now?: Date): string {
  const d = now ?? new Date();
  return d.toISOString().slice(0, 10);
}

/** Record the current date as last active. Call on every hub mount. */
export function recordLastActiveDate(store: KVStore, now?: Date): void {
  store.setString(LAST_ACTIVE_DATE_KEY, todayKey(now));
}

/** Get number of days since last active. Returns 0 if never recorded. */
export function getDaysInactive(store: KVStore, now?: Date): number {
  const raw = store.getString(LAST_ACTIVE_DATE_KEY);
  if (!raw) return 0;
  const last = new Date(raw + "T00:00:00Z");
  const today = new Date(todayKey(now) + "T00:00:00Z");
  const diff = Math.floor(
    (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0, diff);
}

/** Whether the re-engagement card should be shown. */
export function shouldShowReengagement(
  store: KVStore,
  now?: Date,
): { show: boolean; daysInactive: number } {
  const daysInactive = getDaysInactive(store, now);
  if (daysInactive < 7) return { show: false, daysInactive };

  const shownDate = store.getString(REENGAGEMENT_SHOWN_KEY);
  if (shownDate === todayKey(now)) return { show: false, daysInactive };

  return { show: true, daysInactive };
}

/** Mark re-engagement as shown for today. */
export function markReengagementShown(store: KVStore, now?: Date): void {
  store.setString(REENGAGEMENT_SHOWN_KEY, todayKey(now));
}
