/**
 * Pure reminder-scheduling helpers for the Routine module.
 *
 * Produces descriptor objects that describe WHEN and WHAT to notify
 * the user about — without actually calling `Notification`,
 * `navigator.serviceWorker`, or any Expo/RN notification API. Platform
 * adapters (web ServiceWorker, `expo-notifications` on mobile) consume
 * these descriptors to register real alarms.
 *
 * Extracted from `apps/web/src/modules/routine/hooks/useRoutineReminders.ts`
 * (Phase 5 / PR 2) — only the pure "which habit fires at which time
 * today/tomorrow/…" logic. The DOM/service-worker plumbing stays on
 * the web side.
 */

import { dateKeyFromDate, parseDateKey } from "./dateKeys.js";
import { habitScheduledOnDate } from "./schedule.js";
import { normalizeReminderTimes } from "./drafts.js";
import type { Habit, RoutineState } from "./types.js";

/** Prefix для idempotent-ключа "дана звичка вже повідомлена у цей день/час". */
export const ROUTINE_NOTIFY_PREFIX = "routine_notify_";

export interface RoutineReminderDescriptor {
  /** Habit.id цієї нагадувалки. */
  habitId: string;
  /** Emoji + назва звички — готовий title для Notification. */
  title: string;
  /** Локальний день "YYYY-MM-DD" — коли звичка запланована. */
  dateKey: string;
  /** "HH:MM" — час спрацьовування (local). */
  time: string;
  /**
   * Epoch-ms часу спрацьовування у локальному timezone. Стабільний для
   * тестів (приймає base-now замість live-`Date.now()`).
   */
  fireAtMs: number;
  /** Ідемпотентний ключ для "вже повідомлено". */
  notifyKey: string;
}

export interface BuildReminderScheduleOptions {
  /** "Зараз" — base timestamp, від якого рахуємо "у майбутньому". */
  now: Date;
  /** Скільки днів наперед включати у розклад. Default: 1 (сьогодні). */
  daysAhead?: number;
  /** Якщо істинне — не виключати звички, чиє фактичне виконання вже зафіксовано у `completions` для відповідного дня. */
  includeAlreadyCompleted?: boolean;
}

function hmToFireAtMs(dateKey: string, hm: string): number {
  const d = parseDateKey(dateKey);
  const [h, m] = hm.split(":").map((x) => Number(x));
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/**
 * Побудувати список нагадувань для activerних звичок у діапазоні
 * `[now, now + daysAhead]`. Пропускає архівовані звички, звички поза
 * розкладом, і (за замовчуванням) ті, що вже позначені виконаними на
 * відповідний день.
 */
export function buildReminderSchedule(
  state: RoutineState,
  {
    now,
    daysAhead = 1,
    includeAlreadyCompleted = false,
  }: BuildReminderScheduleOptions,
): RoutineReminderDescriptor[] {
  if (!state.prefs?.routineRemindersEnabled) return [];
  const out: RoutineReminderDescriptor[] = [];
  const baseMs = now.getTime();

  for (let i = 0; i < Math.max(1, daysAhead); i++) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    day.setHours(12, 0, 0, 0);
    const dk = dateKeyFromDate(day);

    for (const h of state.habits) {
      if (h.archived) continue;
      if (!habitScheduledOnDate(h, dk)) continue;
      const times = normalizeReminderTimes(h);
      if (times.length === 0) continue;
      const completed = (state.completions[h.id] || []).includes(dk);
      if (!includeAlreadyCompleted && completed) continue;

      for (const hm of times) {
        const fireAtMs = hmToFireAtMs(dk, hm);
        if (i === 0 && fireAtMs < baseMs) continue;
        out.push({
          habitId: h.id,
          // Гліф звички більше не префіксує заголовок: з 2026-08-03 у полі
          // лежить icon-slug (`glyphs.ts`), а не emoji, і `"droplet Пити
          // воду"` — не той пуш, який хочеться отримати. Іконку малює UI,
          // нотифікація несе саму назву.
          title: h.name,
          dateKey: dk,
          time: hm,
          fireAtMs,
          notifyKey: reminderNotifyKey(h.id, hm, dk),
        });
      }
    }
  }

  out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  return out;
}

/** Ідемпотентний ключ "звичку вже повідомили у цей день/час". */
export function reminderNotifyKey(
  habitId: string,
  hm: string,
  dateKey: string,
): string {
  return `${ROUTINE_NOTIFY_PREFIX}${habitId}_${hm}_${dateKey}`;
}

/**
 * Чи ключ `routine_notify_*` старіший за `maxAgeDays`. Використовується
 * адаптерами для чистки застарілих idempotency-міток з MMKV/localStorage.
 */
export function isStaleNotifyKey(
  key: string,
  now: Date,
  maxAgeDays = 45,
): boolean {
  if (!key.startsWith(ROUTINE_NOTIFY_PREFIX)) return false;
  const m = key.match(/(\d{4}-\d{2}-\d{2})$/);
  const d = m?.[1];
  if (!d) return false;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  const cutoffKey = dateKeyFromDate(cutoff);
  return d < cutoffKey;
}

/**
 * Чи час `hm` (HH:MM) потрапляє "зараз" (той же локальний день і хвилина)
 * відносно `now`. Використовується web-адаптером для polling-режиму.
 */
export function reminderDueNow(hm: string, now: Date): boolean {
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  return current === hm;
}

/** Чи звичка прямо зараз потребує нагадування? */
export function habitShouldNotifyNow(
  habit: Habit,
  completionsForHabit: string[] | undefined,
  now: Date,
): { should: boolean; dateKey: string; time: string } | null {
  if (habit.archived) return null;
  const dk = dateKeyFromDate(now);
  if (!habitScheduledOnDate(habit, dk)) return null;
  const times = normalizeReminderTimes(habit);
  if (times.length === 0) return null;
  const completed = (completionsForHabit || []).includes(dk);
  if (completed) return null;
  for (const hm of times) {
    if (reminderDueNow(hm, now)) {
      return { should: true, dateKey: dk, time: hm };
    }
  }
  return null;
}
