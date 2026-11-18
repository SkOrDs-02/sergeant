/**
 * Звички для блоку «Зараз» на хабі: які показати і скільки лишилось.
 *
 * AI-CONTEXT: OD-29, Р-2 (а). Відповідь власника П-15 (А) 2026-11-18: у
 * «Зараз» не більше двох звичок і рядок «ще N звичок». Чиста функція без
 * годинника: «сьогодні» передає викликач (день пристрою, ADR-0078).
 *
 * Що вважається відкритою звичкою — те саме, що рядок у списку дня модуля
 * без відмітки (`buildHubCalendarEvents`): звичка запланована на сьогодні
 * (гнучка — поки тижнева ціль не добрана, `weekDoneCountExcludingDate`), не
 * в архіві й не на паузі, і сьогодні ще без відмітки. Заявлений «не зміг»
 * теж закриває день (канон §5: це стан дня, а не пропуск), тож такий рядок
 * у «Зараз» не повертається. `once` лишається, як і в списку дня (семантика
 * чек-листа, канон §7 п.2).
 *
 * Порядок той самий, що бачить людина в модулі: секції доби
 * (`HABIT_TIME_GROUPS`: Ранок → День → Вечір → Будь-коли) і ручний порядок
 * `habitOrder` усередині секції (рішення 2026-11-17, п. 3 журналу канону).
 * Тож «перші дві» на хабі — перші два невідмічені рядки списку дня.
 */

import { HABIT_TIME_GROUPS, timeOfDayBucket } from "./calendarGrid.js";
import { habitCountTarget } from "./counterFields.js";
import { sortHabitsByOrder } from "./habitOrder.js";
import { habitScheduledOnDate } from "./schedule.js";
import type { RoutineState } from "./types.js";
import { isFlexibleHabit, weekDoneCountExcludingDate } from "./weeklyTarget.js";

/** Стеля звичок у «Зараз» (П-15 (А) 2026-11-18). */
export const HABITS_FOR_NOW_LIMIT = 2;

export interface HabitNowItem {
  habitId: string;
  name: string;
  /** `HH:MM` або порожньо — для підпису секції, якщо рядок захоче його. */
  timeOfDay: string;
  /**
   * Звичка з лічильником (Р-1 (а)): ціль, кроки сьогодні й одиниця, щоб
   * рядок показав «2 з 3», а не голий чекбокс. Чекбокс такого рядка —
   * один крок «+1» (`checkInHabitFromHub`). Відсутні — звичка «так/ні».
   */
  counter?: { target: number; count: number; unit?: string };
}

export interface HabitsForNow {
  /** Не більше `limit` відкритих звичок у порядку списку дня. */
  items: HabitNowItem[];
  /** Скільки відкритих звичок не влізло: число для рядка «ще N звичок». */
  moreCount: number;
  /** Усього відкритих звичок сьогодні. */
  totalOpen: number;
}

export function selectHabitsForNow(
  state: Pick<
    RoutineState,
    "habits" | "completions" | "skips" | "habitOrder" | "counts"
  >,
  todayKey: string,
  limit: number = HABITS_FOR_NOW_LIMIT,
): HabitsForNow {
  const cap = Math.max(0, Math.floor(limit));
  const active = sortHabitsByOrder(
    (state.habits ?? []).filter((h) => h && !h.archived),
    state.habitOrder ?? [],
  );
  const groupOrder = HABIT_TIME_GROUPS as readonly string[];

  const open: Array<HabitNowItem & { group: number; idx: number }> = [];
  for (const [idx, h] of active.entries()) {
    const done = state.completions?.[h.id] ?? [];
    if (done.includes(todayKey)) continue;
    if (state.skips?.[h.id]?.[todayKey]) continue;
    const weekDoneCount = isFlexibleHabit(h)
      ? weekDoneCountExcludingDate(done, todayKey)
      : undefined;
    if (!habitScheduledOnDate(h, todayKey, { weekDoneCount })) continue;
    const timeOfDay = h.timeOfDay ? String(h.timeOfDay).trim() : "";
    const group = groupOrder.indexOf(timeOfDayBucket(timeOfDay));
    const target = habitCountTarget(h);
    open.push({
      habitId: h.id,
      name: h.name,
      timeOfDay,
      ...(target !== null
        ? {
            counter: {
              target,
              count: state.counts?.[h.id]?.[todayKey] ?? 0,
              ...(h.countUnit ? { unit: h.countUnit } : {}),
            },
          }
        : {}),
      group: group === -1 ? groupOrder.length : group,
      idx,
    });
  }
  open.sort((a, b) => a.group - b.group || a.idx - b.idx);

  const items = open
    .slice(0, cap)
    .map(({ habitId, name, timeOfDay, counter }): HabitNowItem => ({
      habitId,
      name,
      timeOfDay,
      ...(counter ? { counter } : {}),
    }));
  return {
    items,
    moreCount: Math.max(0, open.length - items.length),
    totalOpen: open.length,
  };
}
