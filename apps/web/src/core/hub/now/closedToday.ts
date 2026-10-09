/**
 * Купа «Закрито сьогодні» — одне твердження на активний модуль.
 *
 * Спека: `docs/work/specs/hub-action-axis.md` § «Купа „Закрито сьогодні“».
 * Правило власника (2026-09-17): **суворо там, де є ціль; інакше — будь-який
 * запис за день.** Тому купа ніколи не довша за чотири рядки, а слово
 * «закрито» не бреше: одна відмічена звичка з п'яти рядка не дає. Фінік
 * додатково не «закритий», поки висить перевищення ліміту або попередження
 * про темп витрат (рішення власника 2026-10-01).
 *
 * Число в рядку — те саме, що показувала плитка (`ModulePreview.main`
 * через `MODULE_CONFIGS[id].getPreview()`), тобто жодного нового запиту
 * даних: рядок — це демоція картки, а не нова сутність. Предикат «закрито»
 * читає ті самі теплі кеші, що й `recommendationEngine` (сирі сховища
 * модулів — визнаний борг канону hub-coach § 10а, тут нового прецеденту
 * не створюємо, а йдемо вже протоптаною стежкою).
 *
 * Last validated: 2026-09-17
 * Status: Active
 */

import {
  formatMoney,
  formatNumberUk,
  kyivDayStartMs,
  pluralUa,
  toKyivISODate,
} from "@sergeant/shared";
import { Recommendations } from "@sergeant/insights";
import type { DashboardModuleId } from "@sergeant/shared";
import { dateKeyFromDate } from "@sergeant/routine-domain";
import {
  habitScheduledOnDate,
  isFlexibleHabit,
  weekDoneCountExcludingDate,
} from "@sergeant/routine-domain";
import { getDayMacros, resolveEffectiveGoal } from "@sergeant/nutrition-domain";
import { WEEK_KCAL_OVER_TOLERANCE } from "@sergeant/nutrition-domain";
import { calcFinykPeriodAggregate } from "@sergeant/finyk-domain/lib/spending";
import { getLimitBudgets } from "@sergeant/finyk-domain/domain/budget";
import { shiftDayKey } from "@sergeant/finyk-domain/domain/weekSlices";
import { loadRoutineState } from "@routine/lib/routineStorage";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import {
  loadNutritionGoalPeriods,
  loadNutritionLog,
} from "@nutrition/lib/nutritionStorage";
import { readFinykStatsContext } from "@finyk/lib/lsStats";
import { maskAmount } from "@finyk/lib/balanceVisibility";
import type { Rec } from "../../lib/recommendationEngine";

export interface ClosedTodayItem {
  module: DashboardModuleId;
  /** Предмет дня — «Звички», «Витрати», «Тренування», «Їжа». */
  label: string;
  /** Твердження про день: «усі 5 відмічені», «у коридорі цілі». */
  statement: string;
  /** Число, яке показувала плитка; `null`, коли числа немає. */
  value: string | null;
}

export interface ClosedTodayInput {
  activeModules: readonly string[];
  /**
   * УСІ активні рекомендації, **без відкинутих** («✕» у «Зараз»): перевищення
   * ліміту не зникає від того, що людина сховала картку про нього. Відфільтрований
   * список (`focus` + `rest`) сюди не годиться — з ним рядок Фініка казав би
   * «в межах лімітів» поруч із реально перевищеним лімітом.
   */
  recs: readonly Rec[];
  now?: Date;
}

/** Ті самі межі, що й у `countKcalStreakDays` — 95…105 % денної цілі. */
function kcalWithinGoal(kcal: number, goal: number): boolean {
  const ratio = kcal / goal;
  return (
    ratio >= 2 - WEEK_KCAL_OVER_TOLERANCE && ratio <= WEEK_KCAL_OVER_TOLERANCE
  );
}

const MEAL_FORMS = { one: "прийом", few: "прийоми", many: "прийомів" } as const;

/**
 * Рядок «Закрито» називає не модуль, а те, що закрито: «Звички», не
 * «Рутина». Назва модуля живе в рейку; тут — предмет дня.
 */
export const CLOSED_TODAY_LABELS: Record<DashboardModuleId, string> = {
  finyk: "Витрати",
  fizruk: "Тренування",
  routine: "Звички",
  nutrition: "Їжа",
};

function routineClosed(todayKey: string): ClosedTodayItem | null {
  const state = loadRoutineState();
  let scheduled = 0;
  let done = 0;
  for (const h of state.habits) {
    if (h.archived) continue;
    const completions = state.completions[h.id] ?? [];
    // Гнучка звичка перестає бути запланованою, щойно тижневу ціль добрано
    // — той самий предикат, що й у `useTodoEveningInsight`.
    const weekDoneCount = isFlexibleHabit(h)
      ? weekDoneCountExcludingDate(completions, todayKey)
      : undefined;
    if (!habitScheduledOnDate(h, todayKey, { weekDoneCount })) continue;
    scheduled += 1;
    if (completions.includes(todayKey)) done += 1;
  }
  // Ціль у Рутині є завжди — це сам список звичок дня. Без запланованих
  // звичок закривати нічого.
  if (scheduled === 0 || done < scheduled) return null;
  return {
    module: "routine",
    label: CLOSED_TODAY_LABELS.routine,
    statement: scheduled === 1 ? "єдина звичка відмічена" : "усі відмічені",
    value: `${done}/${scheduled}`,
  };
}

function nutritionClosed(todayKey: string): ClosedTodayItem | null {
  const log = loadNutritionLog();
  const day = log[todayKey];
  const meals = Array.isArray(day?.meals) ? day.meals : [];
  if (meals.length === 0) return null;
  const { kcal } = getDayMacros(log, todayKey);
  const goalKcal = resolveEffectiveGoal(
    loadNutritionGoalPeriods(),
    todayKey,
  ).kcal;
  const hasGoal =
    typeof goalKcal === "number" && Number.isFinite(goalKcal) && goalKcal > 0;
  if (hasGoal) {
    if (!kcalWithinGoal(kcal, goalKcal)) return null;
    return {
      module: "nutrition",
      label: CLOSED_TODAY_LABELS.nutrition,
      statement: "у коридорі цілі",
      value: `${formatNumberUk(Math.round(kcal))} ккал`,
    };
  }
  return {
    module: "nutrition",
    label: CLOSED_TODAY_LABELS.nutrition,
    statement: `${meals.length} ${pluralUa(meals.length, MEAL_FORMS)} записано`,
    value: kcal > 0 ? `${formatNumberUk(Math.round(kcal))} ккал` : null,
  };
}

function fizrukClosed(todayKey: string): ClosedTodayItem | null {
  const fizruk = getCachedFizrukSqliteState();
  if (fizruk.refreshedAt === null) return null;
  const today = fizruk.workouts.filter((w) => {
    if (!w.endedAt) return false;
    const ended = new Date(w.endedAt);
    return (
      Number.isFinite(ended.getTime()) && dateKeyFromDate(ended) === todayKey
    );
  });
  if (today.length === 0) return null;
  let minutes = 0;
  for (const w of today) {
    const start = Date.parse(w.startedAt);
    const end = Date.parse(w.endedAt as string);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      minutes += Math.round((end - start) / 60_000);
    }
  }
  return {
    module: "fizruk",
    label: CLOSED_TODAY_LABELS.fizruk,
    statement:
      minutes > 0
        ? `сьогодні, ${minutes} хв`
        : today.length === 1
          ? "тренування завершене"
          : "тренування завершені",
    value: `${today.length}`,
  };
}

function finykClosed(now: Date, recs: readonly Rec[]): ClosedTodayItem | null {
  // Доба для ГРОШЕЙ — київська (рішення власника 2026-10-01, ADR-0078): так
  // само її ріжуть денна картка про темп і «Звіти», тож «Витрати: N ₴» тут
  // збігається з «Сьогодні N ₴» там. Решта рядків купи (звички, їжа,
  // тренування) лишаються на добі телефона — `todayKey` у `computeClosedToday`.
  const todayKey = toKyivISODate(now);
  const { txs, excludedTxIds, txSplits, budgets } = readFinykStatsContext();
  const { totalSpent } = calcFinykPeriodAggregate(txs, {
    start: kyivDayStartMs(todayKey),
    end: kyivDayStartMs(shiftDayKey(todayKey, 1)),
    excludedTxIds,
    txSplits,
  });
  if (!(totalSpent > 0)) return null;
  // Ліміт — єдина ціль Фініка на день. Перевищення живе в рушії
  // рекомендацій як `budget_over_*`; поки воно активне, витрати не «закриті»,
  // а стоять у «Зараз».
  if (recs.some((r) => r.id.startsWith("budget_over_"))) return null;
  // Те саме з попередженням про ТЕМП («Сьогодні вище середнього», «Витрати
  // вище ніж минулого тижня»): галочка «записано» поруч із такою карткою
  // суперечить їй (рішення власника 2026-10-01, f5; змінює правило від
  // 2026-09-17, де темп у предикаті не брав участі). Похвала за темп сюди не
  // входить. «✕» картку лише відкладає, а сигнал лишається в `recs`, тож
  // сховане попередження так само не дає Фініку потрапити в «Закрито».
  if (
    recs.some((r) =>
      Recommendations.SPENDING_PACE_WARNING_REC_IDS.includes(r.id),
    )
  )
    return null;
  // «У межах лімітів» — твердження про ліміти, тож без жодного ліміту його
  // немає про що казати: спека `hub-action-axis.md` — без лімітів це просто
  // «є витрата».
  const hasLimits = getLimitBudgets(budgets).length > 0;
  return {
    module: "finyk",
    label: CLOSED_TODAY_LABELS.finyk,
    statement: hasLimits ? "записано · у межах лімітів" : "записано",
    value: maskAmount(formatMoney(totalSpent)),
  };
}

/**
 * Один рядок на активний модуль, у сталому порядку модулів. Модуль без
 * закритого сьогодні рядка не має. Кожен читач захищений окремо: збій
 * одного кешу не гасить купу цілком.
 */
export function computeClosedToday(input: ClosedTodayInput): ClosedTodayItem[] {
  const now = input.now ?? new Date();
  const todayKey = dateKeyFromDate(now);
  const active = new Set(input.activeModules);
  const readers: Array<[DashboardModuleId, () => ClosedTodayItem | null]> = [
    ["finyk", () => finykClosed(now, input.recs)],
    ["fizruk", () => fizrukClosed(todayKey)],
    ["routine", () => routineClosed(todayKey)],
    ["nutrition", () => nutritionClosed(todayKey)],
  ];
  const out: ClosedTodayItem[] = [];
  for (const [id, read] of readers) {
    if (!active.has(id)) continue;
    try {
      const item = read();
      if (item) out.push(item);
    } catch {
      // Кеш модуля ще не теплий або зіпсований — модуль просто не
      // потрапляє в «Закрито», решта купи живе.
    }
  }
  return out;
}
