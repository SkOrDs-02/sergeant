/**
 * Habit-draft utilities used by `HabitForm` (web) and the upcoming
 * mobile equivalent — pure, no DOM / storage.
 *
 * Extracted from `apps/web/src/modules/routine/lib/routineDraftUtils.ts`
 * (Phase 5 / PR 2). Behaviour is unchanged; TypeScript signatures
 * were tightened for cross-platform consumers.
 */

import { dateKeyFromDate } from "./dateKeys.js";
import { DEFAULT_ROUTINE_GLYPH, resolveHabitGlyph } from "./glyphs.js";
import type {
  Habit,
  HabitDraft,
  HabitDraftPatch,
  ReminderPreset,
} from "./types.js";
import {
  DEFAULT_WEEKLY_TARGET,
  appendWeeklyTargetInterval,
  normalizeWeeklyTarget,
  weeklyTargetForDate,
} from "./weeklyTarget.js";

/**
 * Inline validation errors surfaced by `HabitForm` next to the offending
 * field (red border + message).
 *
 * Extracted from `apps/web/src/modules/routine/components/settings/
 * HabitForm.tsx` (Phase 5 / PR 3 — Habits editor on mobile). Kept in
 * the domain package so both `apps/web` and `apps/mobile` share the
 * exact same validation contract and error copy.
 */
export interface HabitFormErrors {
  name?: string;
  weekdays?: string;
  weeklyTarget?: string;
}

export function routineTodayDate(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

export const REMINDER_PRESETS: readonly ReminderPreset[] = [
  { id: "morning", label: "Ранок", times: ["08:00"] },
  { id: "afternoon", label: "День", times: ["13:00"] },
  { id: "evening", label: "Вечір", times: ["20:00"] },
  { id: "twice", label: "Ранок + Вечір", times: ["08:00", "20:00"] },
  {
    id: "thrice",
    label: "Ранок / День / Вечір",
    times: ["08:00", "13:00", "20:00"],
  },
];

/** `"HH:MM"` → хвилини від опівночі; `null` для нерозбірного вводу. */
function minutesOfDay(time: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Відстань між двома моментами доби по колу — 23:30 і 00:30 різнить година. */
function circularDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 24 * 60 - raw);
}

/**
 * Якорі частин доби — беруться з самих пресетів, а не задаються окремо, щоб
 * не розʼїхались: `Ранок` = 08:00, `День` = 13:00, `Вечір` = 20:00.
 */
const PART_OF_DAY_ANCHORS: readonly number[] = [8 * 60, 13 * 60, 20 * 60];

/**
 * До якої частини доби належить час — за НАЙБЛИЖЧИМ якорем по колу.
 *
 * Межі не вигадані окремо, а випливають із якорів: 11:00 ближче до 13:00, ніж
 * до 08:00, тож це «День»; 23:00 ближче до 20:00 — «Вечір»; 02:00 однаково
 * далеко від 08:00 і 20:00, і нічия свідомо дістається ранку (перший якір),
 * аби результат був детермінований.
 */
function partOfDay(time: string): number | null {
  const mins = minutesOfDay(time);
  if (mins === null) return null;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  PART_OF_DAY_ANCHORS.forEach((anchor, i) => {
    const d = circularDistance(mins, anchor);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Пресет, який описує поточний набір часів, або `null`.
 *
 * AI-CONTEXT: збіг рахується за ЧАСТИНАМИ ДОБИ, а не за точним часом. Точна
 * рівність давала помітну користувачеві поломку: правиш 08:00 на 11:00 —
 * і підсвітка «Ранок» просто гасне, ніби вибір скинувся. Тестер сформулював
 * це точно: «якби вона стрибала на інший час доби — ок, а так наче чогось
 * не вистачає».
 *
 * **Кількість часів теж має збігтися.** Два ранкові нагадування (08:00 і
 * 09:00) — це НЕ пресет «Ранок»: інакше чип брехав би про поточний стан, а
 * повторний клік по ньому мовчки знищив би одне з двох нагадувань.
 */
export function matchReminderPreset(
  times: readonly string[],
): ReminderPreset | null {
  const parts = times.map(partOfDay);
  if (parts.some((p) => p === null)) return null;
  const cur = (parts as number[]).slice().sort((a, b) => a - b);

  for (const preset of REMINDER_PRESETS) {
    const ref = preset.times
      .map(partOfDay)
      .filter((p): p is number => p !== null)
      .sort((a, b) => a - b);
    if (ref.length !== cur.length) continue;
    if (ref.every((p, i) => p === cur[i])) return preset;
  }
  return null;
}

export function normalizeReminderTimes(
  habit: Pick<Habit, "reminderTimes" | "timeOfDay">,
): string[] {
  if (Array.isArray(habit.reminderTimes) && habit.reminderTimes.length > 0) {
    return habit.reminderTimes.filter(
      (t) => typeof t === "string" && /^\d{2}:\d{2}$/.test(t),
    );
  }
  const legacy = habit.timeOfDay && String(habit.timeOfDay).trim();
  if (legacy && /^\d{2}:\d{2}$/.test(legacy)) return [legacy];
  return [];
}

export function emptyHabitDraft(): HabitDraft {
  const t = routineTodayDate();
  return {
    name: "",
    emoji: DEFAULT_ROUTINE_GLYPH,
    tagIds: [],
    categoryId: null,
    recurrence: "daily",
    startDate: dateKeyFromDate(t),
    endDate: "",
    timeOfDay: "",
    reminderTimes: [],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    paused: false,
    weeklyTarget: DEFAULT_WEEKLY_TARGET,
    weeklyTargetHistory: [],
  };
}

export function habitDraftToPatch(draft: HabitDraft): HabitDraftPatch {
  const tagIds = draft.tagIds || [];
  const reminderTimes = (draft.reminderTimes || [])
    .map((t) =>
      String(t || "")
        .trim()
        .slice(0, 5),
    )
    .filter((t) => /^\d{2}:\d{2}$/.test(t));

  const timeOfDay =
    reminderTimes[0] ||
    (draft.timeOfDay && String(draft.timeOfDay).trim()
      ? String(draft.timeOfDay).trim().slice(0, 5)
      : "");

  const recurrence = draft.recurrence || "daily";
  const startDate = draft.startDate || dateKeyFromDate(routineTodayDate());
  const weeklyTarget = normalizeWeeklyTarget(draft.weeklyTarget);

  return {
    name: draft.name.trim(),
    emoji: resolveHabitGlyph(draft.emoji),
    tagIds,
    categoryId: draft.categoryId || null,
    recurrence,
    startDate,
    endDate:
      draft.endDate && String(draft.endDate).trim()
        ? String(draft.endDate).trim()
        : null,
    timeOfDay,
    reminderTimes,
    weekdays:
      recurrence === "flexible"
        ? []
        : Array.isArray(draft.weekdays)
          ? draft.weekdays
          : [0, 1, 2, 3, 4, 5, 6],
    paused: draft.paused === true,
    weeklyTargetHistory:
      recurrence === "flexible"
        ? appendWeeklyTargetInterval(
            draft.weeklyTargetHistory,
            startDate,
            weeklyTarget,
          )
        : draft.weeklyTargetHistory,
  };
}

/**
 * Load an existing habit into a fully-populated `HabitDraft` so the
 * form renders controlled inputs.
 *
 * Mirrors `loadHabitIntoDraft` from the web
 * `RoutineSettingsSection` so switching between "new" and "edit" modes
 * is platform-agnostic.
 */
export function habitToDraft(h: Habit): HabitDraft {
  const reminderTimes = normalizeReminderTimes(h);
  const weekdays =
    Array.isArray(h.weekdays) && h.weekdays.length > 0
      ? [...h.weekdays]
      : [0, 1, 2, 3, 4, 5, 6];
  return {
    name: h.name || "",
    emoji: resolveHabitGlyph(h.emoji),
    tagIds: Array.isArray(h.tagIds) ? [...h.tagIds] : [],
    categoryId: h.categoryId || null,
    recurrence: h.recurrence || "daily",
    startDate: h.startDate || dateKeyFromDate(routineTodayDate()),
    endDate: h.endDate || "",
    timeOfDay: h.timeOfDay || "",
    reminderTimes,
    weekdays,
    paused: h.paused === true,
    weeklyTarget: weeklyTargetForDate(h, dateKeyFromDate(routineTodayDate())),
    weeklyTargetHistory: Array.isArray(h.weeklyTargetHistory)
      ? [...h.weeklyTargetHistory]
      : [],
  };
}

/**
 * Inline validator for `HabitForm`. Returns a `HabitFormErrors` object
 * — empty when the draft is valid. Callers decide whether to render
 * the errors, re-focus the offending field, etc.
 *
 * Rules (mirror web `HabitForm` inline validation):
 *   - `name` must be non-empty after trim.
 *   - When `recurrence === "weekly"`, at least one weekday must be
 *     selected.
 */
export function validateHabitDraft(draft: HabitDraft): HabitFormErrors {
  const errors: HabitFormErrors = {};
  const patch = habitDraftToPatch(draft);
  if (!patch.name) {
    errors.name = "Додай назву звички.";
  }
  if (
    patch.recurrence === "weekly" &&
    (!patch.weekdays || patch.weekdays.length === 0)
  ) {
    errors.weekdays = "Обери хоча б один день тижня.";
  }
  if (
    patch.recurrence === "flexible" &&
    (draft.weeklyTarget < 1 || draft.weeklyTarget > 7)
  ) {
    errors.weeklyTarget = "Обери ціль від 1 до 7 разів.";
  }
  return errors;
}

/** Convenience: `true` if there are no validation errors. */
export function isHabitDraftValid(draft: HabitDraft): boolean {
  const errors = validateHabitDraft(draft);
  return !errors.name && !errors.weekdays && !errors.weeklyTarget;
}
