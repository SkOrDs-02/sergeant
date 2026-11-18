/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Рядки «Зараз», які приходять не з ранкерів, а з даних модулів: звички дня
 * (OD-29 Р-2 (а)) і «спишеться» (OD-26 Ф-4 (а)). Чисті функції: дані дають
 * хуки модулів (`useHabitsForNow`, `useFinykDueCharges`), а тут лише форма
 * рядка, пріоритет на шкалі `Rec` і злиття з рештою купи.
 *
 * Спеки: `docs/work/specs/routine-counter-automark-percent-and-hub-rows.md`,
 * `docs/work/specs/finyk-history-three-months-and-upcoming-charges.md`
 * (розділи «Рядки на хабі»).
 *
 * AI-CONTEXT: пріоритети виведені тим самим правилом, що `INSIGHT_PRIORITY`
 * у `nowItems.ts` («близнюк отримує число двійника»):
 *
 * - рядки звичок — конкретна форма сигналу `routine_evening_reminder` /
 *   `routine-todo-evening` («Сьогодні ще не виконано: N звичок», 65). Тому
 *   вони беруть його число, а сам близнюк, поки є відкриті звички, з купи
 *   знімається: та сама річ двома рядками — рівно той дубль, з яким
 *   боровся `mergeNowItems`;
 * - «спишеться» — попередження Фініка до події, того ж класу, що
 *   `budget_warn_*` (60, «ліміт ще не перевищено»), і бере його число.
 *
 * Якщо founder вирішить інакше (відкрите питання в спеці Рутини), міняються
 * дві константи нижче.
 */
import type { HabitsForNow } from "@sergeant/routine-domain";
import {
  formatNumberUk,
  NARROW_NBSP,
  pluralHabits,
  pluralUa,
} from "@sergeant/shared";
import type { DueCharge } from "@finyk/hooks/useFinykDueCharges";
import { maskAmount } from "@finyk/lib/balanceVisibility";
import { coreMessages } from "@shared/i18n/uk.core";
import type { NowItem } from "./nowItems";

/** = `routine_evening_reminder` (`core/lib/recommendations/routineRecs.ts`). */
export const HABIT_ROW_PRIORITY = 65;
/** = `budget_warn_<cat>` (`nowItems.ts`, `INSIGHT_PRIORITY`). */
export const DUE_CHARGES_ROW_PRIORITY = 60;

export const HABIT_ROW_ID_PREFIX = "routine_habit_now_";
export const HABITS_MORE_ROW_ID = "routine_habits_now_more";
/** Id для сховища «закрито сьогодні» (`hub_recs_dismissed_v1`). */
export const DUE_CHARGES_ROW_ID = "finyk_due_charges";

/** Близнюки рядків звичок: знімаються, поки є відкриті звички. */
const HABIT_TWIN_IDS: ReadonlySet<string> = new Set([
  "routine_evening_reminder",
  "routine-todo-evening",
]);

const copy = coreMessages.hub.nowPile;

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/**
 * До двох рядків звичок і, якщо відкритих більше, рядок «ще N звичок»
 * (П-15 (А)). Чекбокс рядка звички відмічає її (П-16 (А)); у рядка «ще N»
 * чекбокса немає, тап веде в Рутину.
 */
export function habitNowItems(habits: HabitsForNow): NowItem[] {
  const rows: NowItem[] = habits.items.map((h) => ({
    id: `${HABIT_ROW_ID_PREFIX}${h.habitId}`,
    module: "routine",
    priority: HABIT_ROW_PRIORITY,
    title: h.name,
    body: h.timeOfDay || undefined,
    action: { kind: "open_module", module: "routine" },
    checkbox: { kind: "habit", habitId: h.habitId },
  }));
  if (habits.moreCount > 0) {
    rows.push({
      id: HABITS_MORE_ROW_ID,
      module: "routine",
      priority: HABIT_ROW_PRIORITY,
      title: fill(copy.habitsMore, {
        count: habits.moreCount,
        unit: pluralHabits(habits.moreCount),
      }),
      action: { kind: "open_module", module: "routine" },
      checkbox: { kind: "none" },
      represents: habits.moreCount,
    });
  }
  return rows;
}

function formatCharge(charge: DueCharge, hidden: boolean): string {
  if (charge.amountMinor === null) return copy.dueAmountUnknown;
  const amount = formatNumberUk(charge.amountMinor / 100, {
    maximumFractionDigits: 2,
  });
  return maskAmount(`${amount}${NARROW_NBSP}${charge.currency}`, hidden);
}

/**
 * Один рядок «спишеться»: найближче списання (порядок дає селектор Фініка:
 * сьогодні перед завтра, більша сума першою) і «ще N платежів», якщо їх
 * кілька. `null` — нічого не заплановано. Суми маскуються за прихованим
 * балансом Фініка, як у картці фактів банку. Тап веде в «Планування»
 * Фініка, де стоїть «Найближчі платежі».
 */
export function dueChargesNowItem(
  charges: readonly DueCharge[],
  hidden: boolean,
): NowItem | null {
  const first = charges[0];
  if (!first) return null;
  const parts = [formatCharge(first, hidden)];
  const more = charges.length - 1;
  if (more > 0) {
    parts.push(
      fill(copy.dueMore, {
        count: more,
        unit: pluralUa(more, {
          one: copy.paymentOne,
          few: copy.paymentFew,
          many: copy.paymentMany,
        }),
      }),
    );
  }
  return {
    id: DUE_CHARGES_ROW_ID,
    module: "finyk",
    priority: DUE_CHARGES_ROW_PRIORITY,
    title: fill(first.daysLeft <= 0 ? copy.dueToday : copy.dueTomorrow, {
      title: first.title,
    }),
    body: parts.join(" · "),
    action: { kind: "open_module", module: "finyk", hash: "budgets" },
    recId: DUE_CHARGES_ROW_ID,
  };
}

/**
 * Зливає рядки модулів із купою ранкерів. Стабільне сортування за спаданням
 * пріоритету: на рівному числі рядки ранкерів ідуть першими, а рядки звичок
 * тримають порядок списку дня (і «ще N» одразу за ними).
 */
export function withModuleRows(
  ranked: readonly NowItem[],
  habitRows: readonly NowItem[],
  dueRow: NowItem | null,
): NowItem[] {
  const hasHabits = habitRows.length > 0;
  const base = hasHabits
    ? ranked.filter(
        (item) =>
          !HABIT_TWIN_IDS.has(item.id) &&
          !(item.recId && HABIT_TWIN_IDS.has(item.recId)) &&
          !(item.insightId && HABIT_TWIN_IDS.has(item.insightId)),
      )
    : [...ranked];
  const all = [...base, ...habitRows, ...(dueRow ? [dueRow] : [])];
  return all.sort((a, b) => b.priority - a.priority);
}

/** Скільки відкритих справ у списку для «зараз N». */
export function countNowItems(items: readonly NowItem[]): number {
  return items.reduce((n, item) => n + (item.represents ?? 1), 0);
}
