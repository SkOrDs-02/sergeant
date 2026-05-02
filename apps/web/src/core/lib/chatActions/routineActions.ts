import { ls, lsSet } from "../hubChatUtils";
import {
  createHabit as routineCreateHabit,
  loadRoutineState,
} from "../../../modules/routine/lib/routineStorage";
import type {
  MarkHabitDoneAction,
  CreateHabitAction,
  CreateReminderAction,
  CompleteHabitForDateAction,
  ArchiveHabitAction,
  AddCalendarEventAction,
  EditHabitAction,
  ReorderHabitsAction,
  HabitStatsAction,
  HabitTrendAction,
  SetHabitScheduleAction,
  PauseHabitAction,
  HabitState,
  ChatAction,
  ChatActionResult,
} from "./types";

// Mon-first 0..6 — matches `@sergeant/routine-domain` `isoWeekdayFromDateKey`
// and `WEEKDAY_LABELS`. Both English short names and Ukrainian short names
// are accepted from the LLM tool input.
const DAY_NAME_TO_INDEX: Readonly<Record<string, number>> = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
  sun: 6,
  пн: 0,
  вт: 1,
  ср: 2,
  чт: 3,
  пт: 4,
  сб: 5,
  нд: 6,
};

const WEEKDAY_LABEL_UK: readonly string[] = [
  "Пн",
  "Вт",
  "Ср",
  "Чт",
  "Пт",
  "Сб",
  "Нд",
];

function normalizeDayToken(token: unknown): number | null {
  if (typeof token !== "string") return null;
  const key = token.trim().toLowerCase();
  if (!key) return null;
  const idx = DAY_NAME_TO_INDEX[key];
  return typeof idx === "number" ? idx : null;
}

export function handleRoutineAction(
  action: ChatAction,
): ChatActionResult | undefined {
  switch (action.name) {
    case "mark_habit_done": {
      const { habit_id, date: habitDate } = (action as MarkHabitDoneAction)
        .input;
      const routineState = ls<HabitState>("hub_routine_v1", {
        habits: [],
        completions: {},
      });
      const completions: Record<string, string[]> = {
        ...(routineState.completions || {}),
      };
      const now = new Date();
      const targetDate =
        habitDate ||
        [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("-");
      const prevArr = Array.isArray(completions[habit_id])
        ? completions[habit_id].slice()
        : [];
      const alreadyDone = prevArr.includes(targetDate);
      const arr = alreadyDone ? prevArr : [...prevArr, targetDate];
      completions[habit_id] = arr;
      lsSet("hub_routine_v1", { ...routineState, completions });
      const habit = (routineState.habits || []).find((h) => h.id === habit_id);
      const result = `Звичку "${habit?.name || habit_id}" відмічено як виконану (${targetDate})`;
      // Якщо звичка вже була в completions до виклику — undo нічого не
      // робить (no-op); інакше прибираємо `targetDate` зі списку.
      if (alreadyDone) {
        return result;
      }
      return {
        result,
        undo: () => {
          const cur = ls<HabitState>("hub_routine_v1", {
            habits: [],
            completions: {},
          });
          const curCompletions = { ...(cur.completions || {}) };
          const list = Array.isArray(curCompletions[habit_id])
            ? curCompletions[habit_id].filter((d) => d !== targetDate)
            : [];
          if (list.length > 0) {
            curCompletions[habit_id] = list;
          } else {
            delete curCompletions[habit_id];
          }
          lsSet("hub_routine_v1", { ...cur, completions: curCompletions });
        },
      };
    }
    case "create_habit": {
      const {
        name,
        emoji,
        recurrence,
        weekdays,
        time_of_day: timeOfDay,
      } = (action as CreateHabitAction).input;
      const trimmed = (name || "").trim();
      if (!trimmed) return "Не можу створити звичку без назви.";
      const allowedRec = new Set([
        "daily",
        "weekdays",
        "weekly",
        "monthly",
        "once",
      ]);
      const rec =
        recurrence && allowedRec.has(recurrence) ? recurrence : "daily";
      const wdays = Array.isArray(weekdays)
        ? weekdays
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        : undefined;
      const tod =
        timeOfDay && /^\d{1,2}:\d{2}$/.test(String(timeOfDay).trim())
          ? String(timeOfDay).trim().padStart(5, "0")
          : "";
      const stateBefore = loadRoutineState();
      const nextState = routineCreateHabit(stateBefore, {
        name: trimmed,
        emoji: emoji || "✓",
        recurrence: rec,
        weekdays: wdays && wdays.length ? wdays : undefined,
        timeOfDay: tod,
      });
      const created = nextState.habits[nextState.habits.length - 1];
      const createdId = created?.id;
      const recLabelMap: Record<string, string> = {
        daily: "щодня",
        weekdays: "по буднях",
        weekly: "щотижня",
        monthly: "щомісяця",
        once: "разово",
      };
      const result = `Звичку "${trimmed}" створено (${recLabelMap[rec] || rec}, id:${createdId || "?"})`;
      if (!createdId) return result;
      // Undo тримає id (а не повний snapshot), щоб не переписувати
      // інші зміни, які можуть статися між створенням і undo
      // (інша звичка створена, completions додані, etc.).
      return {
        result,
        undo: () => {
          const cur = loadRoutineState();
          const habits = Array.isArray(cur.habits)
            ? cur.habits.filter((h) => h.id !== createdId)
            : [];
          if (habits.length === (cur.habits?.length ?? 0)) return;
          const curCompletions = { ...(cur.completions || {}) };
          delete curCompletions[createdId];
          lsSet("hub_routine_v1", {
            ...cur,
            habits,
            completions: curCompletions,
          });
        },
      };
    }
    case "create_reminder": {
      const { habit_id, time } = (action as CreateReminderAction).input;
      const id = String(habit_id || "").trim();
      const t = String(time || "").trim();
      if (!id) return "Потрібен habit_id.";
      if (!/^\d{1,2}:\d{2}$/.test(t)) return "Час має бути у форматі HH:MM.";
      const normTime = t.padStart(5, "0");
      const state = ls<{
        habits?: Array<{
          id: string;
          name?: string;
          reminderTimes?: string[];
        }>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits.slice() : [];
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      const reminders = Array.isArray(habits[hIdx].reminderTimes)
        ? [...(habits[hIdx].reminderTimes as string[])]
        : [];
      if (reminders.includes(normTime)) {
        return `Нагадування ${normTime} для "${habits[hIdx].name || id}" вже існує.`;
      }
      reminders.push(normTime);
      reminders.sort();
      habits[hIdx] = { ...habits[hIdx], reminderTimes: reminders };
      lsSet("hub_routine_v1", { ...state, habits });
      const habitName = habits[hIdx].name || id;
      return {
        result: `Нагадування ${normTime} додано до "${habitName}"`,
        undo: () => {
          const cur = ls<{
            habits?: Array<{
              id: string;
              name?: string;
              reminderTimes?: string[];
            }>;
          }>("hub_routine_v1", {});
          const curHabits = Array.isArray(cur.habits) ? cur.habits.slice() : [];
          const i = curHabits.findIndex((h) => h.id === id);
          if (i < 0) return;
          const list = Array.isArray(curHabits[i].reminderTimes)
            ? (curHabits[i].reminderTimes as string[]).filter(
                (x) => x !== normTime,
              )
            : [];
          curHabits[i] = { ...curHabits[i], reminderTimes: list };
          lsSet("hub_routine_v1", { ...cur, habits: curHabits });
        },
      };
    }
    case "complete_habit_for_date": {
      const { habit_id, date, completed } = (
        action as CompleteHabitForDateAction
      ).input;
      const id = String(habit_id || "").trim();
      const d = String(date || "").trim();
      if (!id) return "Потрібен habit_id.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d))
        return "Дата має бути у форматі YYYY-MM-DD.";
      const doComplete = completed !== false;
      const state = ls<{
        habits?: Array<{ id: string; name?: string }>;
        completions?: Record<string, string[]>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits : [];
      const habit = habits.find((h) => h.id === id);
      if (!habit) return `Звичку ${id} не знайдено.`;
      const completions: Record<string, string[]> = {
        ...(state.completions || {}),
      };
      const prevList = Array.isArray(completions[id])
        ? completions[id].slice()
        : [];
      const cur = prevList.slice();
      const has = cur.includes(d);
      let mutated = false;
      if (doComplete) {
        if (!has) {
          cur.push(d);
          mutated = true;
        }
      } else if (has) {
        const idx = cur.indexOf(d);
        if (idx >= 0) {
          cur.splice(idx, 1);
          mutated = true;
        }
      }
      completions[id] = cur.sort();
      lsSet("hub_routine_v1", { ...state, completions });
      const result = `Звичку "${habit.name || id}" ${doComplete ? "відмічено" : "знято з позначки"} на ${d}`;
      if (!mutated) return result;
      // Undo відновлює лише свою зміну (додав d → видаляє d;
      // видалив d → возвращає d), а не переписує повний snapshot —
      // інакше паралельні mark/unmark інших дат втратяться.
      return {
        result,
        undo: () => {
          const c = ls<{
            completions?: Record<string, string[]>;
          }>("hub_routine_v1", {});
          const cc = { ...(c.completions || {}) };
          const list = Array.isArray(cc[id]) ? cc[id].slice() : [];
          if (doComplete) {
            const next = list.filter((x) => x !== d);
            if (next.length === 0) delete cc[id];
            else cc[id] = next;
          } else {
            if (!list.includes(d)) {
              cc[id] = [...list, d].sort();
            }
          }
          lsSet("hub_routine_v1", { ...c, completions: cc });
        },
      };
    }
    case "archive_habit": {
      const { habit_id, archived } = (action as ArchiveHabitAction).input;
      const id = String(habit_id || "").trim();
      const doArchive = archived !== false;
      if (!id) return "Потрібен habit_id.";
      const state = ls<{
        habits?: Array<{ id: string; name?: string; archived?: boolean }>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits.slice() : [];
      const idx = habits.findIndex((h) => h.id === id);
      if (idx < 0) return `Звичку ${id} не знайдено.`;
      if (!!habits[idx].archived === doArchive) {
        return `Звичку "${habits[idx].name || id}" вже ${doArchive ? "заархівовано" : "активна"}.`;
      }
      habits[idx] = { ...habits[idx], archived: doArchive };
      lsSet("hub_routine_v1", { ...state, habits });
      return `Звичку "${habits[idx].name || id}" ${doArchive ? "заархівовано" : "повернуто з архіву"}`;
    }
    case "add_calendar_event": {
      const { name, date, time, emoji } = (action as AddCalendarEventAction)
        .input;
      const evName = (name || "").trim();
      const d = String(date || "").trim();
      if (!evName) return "Потрібна назва події.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d))
        return "Дата має бути у форматі YYYY-MM-DD.";
      const tod =
        time && /^\d{1,2}:\d{2}$/.test(String(time).trim())
          ? String(time).trim().padStart(5, "0")
          : "";
      const state = loadRoutineState();
      const nextState = routineCreateHabit(state, {
        name: evName,
        emoji: emoji || "📅",
        recurrence: "once",
        startDate: d,
        endDate: d,
        timeOfDay: tod,
      });
      const created = nextState.habits[nextState.habits.length - 1];
      return `Подію "${evName}" додано на ${d}${tod ? ` о ${tod}` : ""} (id:${created?.id || "?"})`;
    }
    case "edit_habit": {
      const { habit_id, name, emoji, recurrence, weekdays } = (
        action as EditHabitAction
      ).input;
      const id = String(habit_id || "").trim();
      if (!id) return "Потрібен habit_id.";
      const state = ls<{
        habits?: Array<{
          id: string;
          name?: string;
          emoji?: string;
          recurrence?: string;
          weekdays?: number[];
        }>;
        completions?: Record<string, string[]>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits.slice() : [];
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      const updated = { ...habits[hIdx] };
      const changes: string[] = [];
      if (name && name.trim()) {
        updated.name = name.trim();
        changes.push(`назва → "${name.trim()}"`);
      }
      if (emoji) {
        updated.emoji = emoji;
        changes.push(`емодзі → ${emoji}`);
      }
      if (recurrence) {
        const allowedRec = new Set(["daily", "weekdays", "weekly", "monthly"]);
        if (allowedRec.has(recurrence)) {
          updated.recurrence = recurrence;
          changes.push(`розклад → ${recurrence}`);
        }
      }
      if (Array.isArray(weekdays) && weekdays.length > 0) {
        updated.weekdays = weekdays.filter(
          (d) => Number.isInteger(d) && d >= 0 && d <= 6,
        );
        changes.push(`дні → [${updated.weekdays.join(",")}]`);
      }
      if (changes.length === 0) return "Немає змін для оновлення.";
      habits[hIdx] = updated;
      lsSet("hub_routine_v1", { ...state, habits });
      return `Звичку "${updated.name || id}" оновлено: ${changes.join(", ")}`;
    }
    case "set_habit_schedule": {
      const { habit_id, days } = (action as SetHabitScheduleAction).input;
      const id = String(habit_id || "").trim();
      if (!id) return "Потрібен habit_id.";
      if (!Array.isArray(days) || days.length === 0)
        return "Потрібен непорожній масив days.";
      const seen = new Set<number>();
      const normalized: number[] = [];
      const unknown: string[] = [];
      for (const raw of days) {
        const idx = normalizeDayToken(raw);
        if (idx === null) {
          if (typeof raw === "string" && raw.trim()) unknown.push(raw.trim());
          continue;
        }
        if (seen.has(idx)) continue;
        seen.add(idx);
        normalized.push(idx);
      }
      if (normalized.length === 0)
        return `Не вдалось розпізнати дні: ${unknown.join(", ") || "(порожньо)"}. Очікую mon/tue/…/sun або пн/вт/…/нд.`;
      normalized.sort((a, b) => a - b);
      const state = ls<{
        habits?: Array<{
          id: string;
          name?: string;
          recurrence?: string;
          weekdays?: number[];
        }>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits.slice() : [];
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      habits[hIdx] = {
        ...habits[hIdx],
        recurrence: "weekly",
        weekdays: normalized,
      };
      lsSet("hub_routine_v1", { ...state, habits });
      const labels = normalized.map((n) => WEEKDAY_LABEL_UK[n]).join(", ");
      return `Розклад звички "${habits[hIdx].name || id}" — ${labels}`;
    }
    case "pause_habit": {
      const { habit_id, paused } = (action as PauseHabitAction).input;
      const id = String(habit_id || "").trim();
      if (!id) return "Потрібен habit_id.";
      const target = paused !== false;
      const state = ls<{
        habits?: Array<{
          id: string;
          name?: string;
          paused?: boolean;
        }>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits.slice() : [];
      const hIdx = habits.findIndex((h) => h.id === id);
      if (hIdx < 0) return `Звичку ${id} не знайдено.`;
      const current = habits[hIdx].paused === true;
      const habitName = habits[hIdx].name || id;
      if (current === target) {
        return target
          ? `Звичка "${habitName}" вже на паузі.`
          : `Звичка "${habitName}" вже активна.`;
      }
      habits[hIdx] = { ...habits[hIdx], paused: target };
      lsSet("hub_routine_v1", { ...state, habits });
      return target
        ? `Звичку "${habitName}" поставлено на паузу.`
        : `Звичку "${habitName}" знято з паузи.`;
    }
    case "reorder_habits": {
      const { habit_ids } = (action as ReorderHabitsAction).input;
      if (!Array.isArray(habit_ids) || habit_ids.length === 0)
        return "Потрібен масив habit_ids.";
      const state = ls<{
        habits?: Array<{ id: string; name?: string }>;
        completions?: Record<string, string[]>;
      }>("hub_routine_v1", {});
      const habits = Array.isArray(state.habits) ? state.habits.slice() : [];
      const habitMap = new Map(habits.map((h) => [h.id, h]));
      const reordered = habit_ids
        .map((id) => habitMap.get(id))
        .filter((h): h is (typeof habits)[0] => h != null);
      const remaining = habits.filter((h) => !habit_ids.includes(h.id));
      lsSet("hub_routine_v1", {
        ...state,
        habits: [...reordered, ...remaining],
      });
      return `Порядок звичок оновлено (${reordered.length} переміщено)`;
    }
    case "habit_stats": {
      const { habit_id, period_days } = (action as HabitStatsAction).input;
      const id = String(habit_id || "").trim();
      if (!id) return "Потрібен habit_id.";
      const days = Number(period_days) || 30;
      const state = ls<{
        habits?: Array<{ id: string; name?: string; emoji?: string }>;
        completions?: Record<string, string[]>;
      }>("hub_routine_v1", {});
      const habit = (state.habits || []).find((h) => h.id === id);
      if (!habit) return `Звичку ${id} не знайдено.`;
      const completions = state.completions || {};
      const habitCompletions = Array.isArray(completions[id])
        ? completions[id]
        : [];
      const now = new Date();
      let doneCount = 0;
      let streak = 0;
      let maxStreak = 0;
      let currentStreak = 0;
      const missedDates: string[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dk = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-");
        if (habitCompletions.includes(dk)) {
          doneCount++;
          currentStreak++;
          if (i === 0 || i === streak) streak = currentStreak;
          if (currentStreak > maxStreak) maxStreak = currentStreak;
        } else {
          currentStreak = 0;
          if (missedDates.length < 5) missedDates.push(dk);
        }
      }
      const pct = days > 0 ? Math.round((doneCount / days) * 100) : 0;
      const parts: string[] = [
        `Статистика "${habit.emoji || ""} ${habit.name || id}" за ${days} днів:`,
        `Виконано: ${doneCount}/${days} (${pct}%)`,
        `Поточна серія: ${streak} днів`,
        `Макс. серія: ${maxStreak} днів`,
      ];
      if (missedDates.length > 0) {
        parts.push(`Останні пропуски: ${missedDates.join(", ")}`);
      }
      return parts.join("\n");
    }
    // ── Харчування v2 ──────────────────────────────────────────
    case "habit_trend": {
      const { habit_id, period_days } =
        (action as HabitTrendAction).input || {};
      const days = Number(period_days) || 30;
      const state = ls<HabitState | null>("hub_routine_v1", null);
      if (!state?.habits || state.habits.length === 0) return "Немає звичок.";
      const habits = habit_id
        ? state.habits.filter((h) => h.id === habit_id)
        : state.habits.filter((h) => !(h as Record<string, unknown>).archived);
      if (habits.length === 0) return `Звичку ${habit_id} не знайдено.`;
      const completions = state.completions || {};
      const now = new Date();
      const weeks = Math.ceil(days / 7);
      const weeklyData: number[] = [];
      for (let w = 0; w < weeks; w++) {
        let done = 0;
        let possible = 0;
        for (let d = 0; d < 7; d++) {
          const dayOffset = w * 7 + d;
          if (dayOffset >= days) break;
          const dt = new Date(now);
          dt.setDate(dt.getDate() - dayOffset);
          const dk = [
            dt.getFullYear(),
            String(dt.getMonth() + 1).padStart(2, "0"),
            String(dt.getDate()).padStart(2, "0"),
          ].join("-");
          for (const h of habits) {
            possible++;
            if (
              Array.isArray(completions[h.id]) &&
              completions[h.id].includes(dk)
            )
              done++;
          }
        }
        weeklyData.push(possible > 0 ? Math.round((done / possible) * 100) : 0);
      }
      const parts: string[] = [
        `Тренд звичок за ${days} днів (${habits.length} звичок):`,
      ];
      weeklyData.reverse();
      for (let i = 0; i < weeklyData.length; i++) {
        parts.push(`  Тиждень ${i + 1}: ${weeklyData[i]}%`);
      }
      const first = weeklyData[0];
      const last = weeklyData[weeklyData.length - 1];
      if (weeklyData.length >= 2) {
        const trend =
          last > first
            ? "покращується"
            : last < first
              ? "погіршується"
              : "стабільно";
        parts.push(`Тренд: ${trend} (${first}% → ${last}%)`);
      }
      return parts.join("\n");
    }
    // ── Утиліти ────────────────────────────────────────────────
    default:
      return undefined;
  }
}
