/**
 * Рекомендації хабу про звички: вечірнє нагадування, серії «N днів поспіль»,
 * «серія може перерватись» і відсоток звичок у понеділковій картці.
 *
 * AI-CONTEXT: logic-12 (аудит 2026-10-01). Раніше тут стояло `total =
 * habits.length`, серія йшла через `habits.every(... includes(dk))`, а знаменник
 * тижня був `habits.length * 7`: жодна з формул не знала про розклад, паузи,
 * `startDate`, `once` і гнучкі звички. Хаб у суботу писав «6 звичок ще не
 * виконано», коли модуль показував «0/2», а понеділкова картка давала 38%
 * проти 53% у Звітах і дайджесті. Тепер усе йде через ті самі примітиви
 * `@sergeant/routine-domain`, що й кільце модуля, Звіти та дайджест:
 *  - «сьогодні N з M» і день серії — `calcRoutineDayProgress`;
 *  - відсоток тижня — `calcRoutinePeriodCompletion`.
 *
 * Серія тут — «днів поспіль, коли ВСЕ заплановане виконано». Це не серія
 * окремої звички і не максимум по звичках (логіка гнучких серій —
 * окремий запис logic-11, `flexStreak.ts` не чіпаємо).
 */

/* eslint-disable sergeant-design/prefer-kyiv-time -- день-ключ особистої доби = годинник пристрою (ADR-0078): `new Date()`/`getHours()` тут навмисно host-local, як і в `recommendationEngine.ts`. */
import {
  calcRoutineDayProgress,
  dateKeyFromDate,
} from "@sergeant/routine-domain";
import { calcRoutinePeriodCompletion } from "@sergeant/routine-domain/period-completion";
import { pluralDays, pluralHabits } from "@sergeant/shared";
import { loadRoutineState } from "@routine/lib/routineStorage";
import type { Recommendations } from "@sergeant/insights";

/** Скільки днів назад шукаємо кінець серії. */
const STREAK_LOOKBACK_DAYS = 365;
const MILESTONE_STREAKS = [3, 7, 14, 30, 60, 100];

type Rec = Recommendations.Rec;
type RoutineSlice = ReturnType<typeof loadRoutineState>;

/**
 * Днів поспіль (рахуючи від учора назад), у які виконано все заплановане.
 * День, на який нічого не заплановано (вихідний звички «Пн/Ср/Пт», пауза,
 * дата до `startDate`), серію не рве і не нарощує. Сьогодні не рахується:
 * день ще не скінчився.
 */
function countAllDoneStreak(state: RoutineSlice, today: string): number {
  const habits = state.habits.filter((h) => !h.archived);
  const skips = state.skips ?? {};
  let streak = 0;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
    const dk = dateKeyFromDate(d);
    const { completed, scheduled } = calcRoutineDayProgress(
      habits,
      state.completions,
      dk,
      today,
      skips,
    );
    if (scheduled > 0) {
      if (completed < scheduled) break;
      streak++;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function buildRoutineRecs(): Rec[] {
  const recs: Rec[] = [];
  // `hub_routine_v1` is tombstoned — read the canonical SQLite warm cache.
  const state = loadRoutineState();

  const habits = state.habits.filter((h) => !h.archived);
  if (habits.length === 0) return recs;

  const today = dateKeyFromDate(new Date());
  // Той самий лічильник «N з M», що й кільце модуля: лише заплановані на
  // сьогодні (паузи, startDate, once, гнучкі) і «не зміг» виходить зі знаменника.
  const { completed: todayDone, scheduled: total } = calcRoutineDayProgress(
    habits,
    state.completions,
    today,
    today,
    state.skips ?? {},
  );

  const streak = countAllDoneStreak(state, today);

  if (MILESTONE_STREAKS.includes(streak)) {
    recs.push({
      id: `routine_streak_${streak}`,
      module: "routine",
      priority: 80,
      icon: "flame",
      title: `${streak} ${pluralDays(streak)} поспіль`,
      body: "Усі звички виконано щодня без пропусків.",
      action: "routine",
    });
  }

  // `total === 0` — на сьогодні нічого не заплановано: нагадувати нема про що.
  const remaining = total - todayDone;
  const hour = new Date().getHours();
  if (hour >= 18 && remaining > 0) {
    recs.push({
      id: "routine_evening_reminder",
      module: "routine",
      priority: 65,
      icon: "check",
      title: `Сьогодні ще не виконано: ${remaining} ${pluralHabits(remaining)}`,
      body: "Відмітити можна до кінця дня.",
      action: "routine",
    });
  }

  // Серія в зоні ризику: пізній вечір + є серія + сьогодні не все виконано
  if (hour >= 21 && streak >= 7 && remaining > 0) {
    recs.push({
      id: "routine_streak_at_risk",
      module: "routine",
      priority: 95,
      icon: "alert",
      title: `Серія ${streak} ${pluralDays(streak)} може перерватись`,
      body: `Залишилось ${remaining} ${pluralHabits(remaining)} на сьогодні.`,
      action: "routine",
    });
  }

  return recs;
}

/**
 * «звички N%» для понеділкової картки «Підсумок минулого тижня»; порожній
 * рядок, якщо за тиждень нічого не було заплановано (немає звичок або всі
 * `once`/на паузі — «0%» тут було б хибним провалом).
 *
 * Той самий виклик, що в `hubReports.aggregation` і `useWeeklyDigest`
 * (`calcRoutinePeriodCompletion` + `pausedFrom: сьогодні`), тож число збігається
 * зі Звітами й дайджестом.
 */
export function buildWeeklyHabitPctText(monPrev: Date, now: Date): string {
  const state = loadRoutineState();
  const habits = state.habits.filter((h) => !h.archived);
  if (habits.length === 0) return "";

  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monPrev);
    d.setDate(monPrev.getDate() + i);
    weekDays.push(dateKeyFromDate(d));
  }
  const period = calcRoutinePeriodCompletion(
    habits,
    state.completions,
    weekDays,
    { pausedFrom: dateKeyFromDate(now) },
  );
  return period.scheduled > 0 ? `звички ${period.pct}%` : "";
}
