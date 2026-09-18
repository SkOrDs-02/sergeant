/**
 * Pure weekday / trigger helpers for routine reminders.
 *
 * Mobile's `useRoutineReminders` hook feeds `Notifications.scheduleNotificationAsync`
 * with Expo's weekly cron-ish trigger:
 *   `{ weekday, hour, minute, repeats: true }`
 * where `weekday` uses Expo's 1..7 scale (1=Sunday, 2=Monday, …, 7=Saturday).
 *
 * Routine's own weekday convention is 0..6 with **0 = Monday** (mirrors the
 * ISO-8601-ish weekly grid used by the habit editor / `WeekdayPicker`).
 *
 * These helpers are DOM-free and Expo-free so both platform adapters
 * (web's service worker, mobile's expo-notifications) can share the
 * exact same mapping logic.
 */

import type { Habit } from "../../types.js";

/**
 * Range-check a routine weekday (0=Mon..6=Sun).
 *
 * Out-of-range inputs are clamped to Monday so malformed persisted
 * state cannot crash downstream Expo calls (RN's native scheduler
 * throws on an out-of-range weekday).
 */
export function normalizeRoutineWeekday(rw: number): number {
  if (!Number.isFinite(rw)) return 0;
  const i = Math.trunc(rw);
  if (i < 0 || i > 6) return 0;
  return i;
}

/**
 * Convert routine-module weekday (0=Mon..6=Sun) to Expo's weekday
 * scale (1=Sun..7=Sat).
 *
 * Mapping:
 *   Mon (0) → 2, Tue (1) → 3, Wed (2) → 4, Thu (3) → 5,
 *   Fri (4) → 6, Sat (5) → 7, Sun (6) → 1.
 */
export function routineWeekdayToExpoWeekday(rw: number): number {
  const safe = normalizeRoutineWeekday(rw);
  // 0→2, 1→3, 2→4, 3→5, 4→6, 5→7, 6→1.
  return safe === 6 ? 1 : safe + 2;
}

/** Clamp hour into the 0..23 range. Out-of-range values fall back to 0. */
export function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const n = Math.trunc(h);
  if (n < 0 || n > 23) return 0;
  return n;
}

/** Clamp minute into the 0..59 range. Out-of-range values fall back to 0. */
export function clampMinute(m: number): number {
  if (!Number.isFinite(m)) return 0;
  const n = Math.trunc(m);
  if (n < 0 || n > 59) return 0;
  return n;
}

/**
 * Parse a "HH:MM" reminder-time string into `{ hour, minute }`.
 *
 * Invalid strings (undefined, wrong shape, NaN parts) collapse to
 * `{ hour: 0, minute: 0 }` — same defensive contract as the rest of
 * the routine-domain pure helpers.
 */
export function parseReminderTime(hm: string | undefined | null): {
  hour: number;
  minute: number;
} {
  if (typeof hm !== "string" || !/^\d{2}:\d{2}$/.test(hm)) {
    return { hour: 0, minute: 0 };
  }
  const [rawH, rawM] = hm.split(":");
  return { hour: clampHour(Number(rawH)), minute: clampMinute(Number(rawM)) };
}

/**
 * Expo weekly-repeating trigger descriptor — domain-shape (Expo-agnostic).
 *
 * Intentionally narrow: just the three fields routine-domain owns
 * (`weekday`, `hour`, `minute`). The mobile adapter layers Expo's
 * `type: SchedulableTriggerInputTypes.WEEKLY` discriminator on top at
 * the call site so this package stays free of `expo-notifications`
 * imports. The week-after-week repetition is implicit — Expo's
 * `WeeklyTriggerInput` does not take a `repeats` flag (that field is
 * specific to `TimeIntervalTriggerInput`).
 */
export interface ExpoWeeklyTrigger {
  /** Expo weekday (1=Sun..7=Sat). */
  weekday: number;
  /** Local wall-clock hour (0..23). */
  hour: number;
  /** Local wall-clock minute (0..59). */
  minute: number;
}

/**
 * Build an Expo weekly trigger for a habit firing on the given routine
 * weekday at `HH:MM`.
 */
export function computeTriggerForHabitWeekday(
  routineWeekday: number,
  hour: number,
  minute: number,
): ExpoWeeklyTrigger {
  return {
    weekday: routineWeekdayToExpoWeekday(routineWeekday),
    hour: clampHour(hour),
    minute: clampMinute(minute),
  };
}

/** Every day of the week (Mon..Sun) — used for `daily` recurrence. */
const EVERY_WEEKDAY = [0, 1, 2, 3, 4, 5, 6];

/** Monday..Friday in routine's 0=Mon convention. */
const WORK_WEEKDAYS = [0, 1, 2, 3, 4];

/**
 * Resolve which routine weekdays (0=Mon..6=Sun) a habit is scheduled
 * to recur on for reminder scheduling purposes.
 *
 * Non-weekly recurrences (`monthly`, `once`) return an empty list —
 * Expo's `{ weekday, hour, minute, repeats: true }` trigger cannot
 * encode "N-th of the month" or "one-shot" semantics, so mobile
 * simply skips them. Those reminders are still honoured by the
 * web adapter via `buildReminderSchedule` which operates on raw
 * dates.
 */
export function habitActiveRoutineWeekdays(
  h: Pick<Habit, "recurrence" | "weekdays" | "archived" | "paused">,
): number[] {
  if (h.archived) return [];
  if (h.paused) return [];
  const rec = (h.recurrence as string) || "daily";
  if (rec === "daily") return [...EVERY_WEEKDAY];
  if (rec === "weekdays") return [...WORK_WEEKDAYS];
  if (rec === "weekly") {
    if (!Array.isArray(h.weekdays)) return [];
    const uniq = new Set<number>();
    for (const raw of h.weekdays) {
      if (typeof raw !== "number") continue;
      if (!Number.isFinite(raw)) continue;
      const n = Math.trunc(raw);
      if (n < 0 || n > 6) continue;
      uniq.add(n);
    }
    return Array.from(uniq).sort((a, b) => a - b);
  }
  // `monthly` / `once` / unknown — weekly trigger cannot express it.
  return [];
}
