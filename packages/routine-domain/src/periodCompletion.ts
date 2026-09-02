/**
 * Канонічне «% виконання звичок за період» — одна агрегація для всіх поверхонь.
 *
 * AI-CONTEXT: знаменник — **заплановані дні** (`habitScheduledOnDate`), а не
 * «7 днів × кількість звичок». Це ратифікована семантика канону
 * (`docs/01-product/model/routine.md`, ADR-0079 §3): звичка «Пн/Ср/Пт»,
 * виконана 3/3, — це 100%, а не 43%. Плоский знаменник карав користувача за
 * дні, у які звичка й не планувалась.
 *
 * `completionRateForRange` (`./streaks.ts`) уже рахує так, але приймає
 * суцільний діапазон і не віддає ані подобової розкладки, ані per-habit зрізу.
 * Дайджест і Hub-Reports потребують саме їх, тому кожен ліпив власний
 * плоский підрахунок. Ця функція — спільний двійник: приймає довільний масив
 * day-key-ів і повертає все три зрізи одразу.
 *
 * Межі доби задає викликач (`dayKeys` у форматі `YYYY-MM-DD`, Europe/Kyiv за
 * доменним інваріантом) — функція DOM-free і без власного годинника.
 *
 * AI-DANGER: зміна знаменника рухає число, яке користувач уже бачив. Будь-яке
 * перемикання нового call-site на цю функцію мусить бампнути `METRICS_VERSION`
 * (`@sergeant/shared/metrics-version`), інакше тренд коуча прочитає стрибок
 * визначення як зміну поведінки (ADR-0079 §4).
 */

import { habitCountsTowardMetrics, habitScheduledOnDate } from "./schedule.js";
import type { Habit, HabitSkip } from "./types.js";
import {
  isFlexibleHabit,
  weekEndKeyForDateKey,
  weekStartKeyForDateKey,
  weeklyTargetForDate,
} from "./weeklyTarget.js";

/** Зріз по одній звичці за період. */
export interface HabitPeriodCompletion {
  id: string;
  name: string;
  /** Скільки запланованих днів відмічено виконаними. */
  done: number;
  /** Скільки днів періоду звичка була запланована. */
  scheduled: number;
  /** `done / scheduled`, округлено до цілих відсотків; 0 при `scheduled === 0`. */
  completionRate: number;
}

export interface RoutinePeriodCompletion {
  /** Сума `done` по всіх звичках. */
  completed: number;
  /** Сума `scheduled` по всіх звичках — канонічний знаменник періоду. */
  scheduled: number;
  /** `completed / scheduled`, округлено до цілих відсотків. */
  pct: number;
  /** Подобова розкладка: day-key → відсоток виконання серед запланованих на цей день. */
  daily: Record<string, number>;
  /** Per-habit зріз у порядку вхідного масиву. */
  perHabit: HabitPeriodCompletion[];
}

export interface RoutinePeriodCompletionOptions {
  /**
   * День «сьогодні» (`YYYY-MM-DD`), від якого пауза починає діяти.
   *
   * Передається наскрізь у `habitScheduledOnDate` — див. його доку про те,
   * чому `paused` як недатований булеан інакше вимиває звичку з усієї історії.
   * Дефолт (не передано) зберігає історичну поведінку: пауза ретроактивна.
   */
  pausedFrom?: string | undefined;
  /**
   * Пропуски з причиною: `habitId → dateKey → HabitSkip`.
   *
   * Та сама семантика, що в `CompletionRateOptions.skips` (`./streaks.ts`):
   * канон §5 виключає день «не зміг» зі ЗНАМЕННИКА, а не рахує його
   * провалом. Опційне й адитивне — існуючі виклики без цього поля
   * (дайджест, Hub-Reports) поведінки не міняють (unification audit
   * 2026-08-31, finding 1.7). Дефолт (не передано) зберігає історичну
   * поведінку: пропуск = провал.
   */
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
}

export function calcRoutinePeriodCompletion(
  habits: readonly Habit[],
  completions: Readonly<Record<string, string[]>>,
  dayKeys: readonly string[],
  opts: RoutinePeriodCompletionOptions = {},
): RoutinePeriodCompletion {
  const keys = Array.isArray(dayKeys) ? dayKeys : [];
  // `archived` відсіюємо тут, а не покладаємось на викликача: Hub-Reports
  // фільтрував, дайджест фільтрував, а чат-тулза — ні. `once` виходить зі
  // знаменника з тієї ж причини (канон §7 п.2, рішення 2026-08-30) — і з
  // per-habit зрізу теж: рядок «0 з 0» у дайджесті — шум, не інформація.
  const active = (Array.isArray(habits) ? habits : []).filter(
    (h) => h && !h.archived && habitCountsTowardMetrics(h),
  );

  const scheduleOpts =
    opts.pausedFrom === undefined ? {} : { pausedFrom: opts.pausedFrom };

  const perHabit: HabitPeriodCompletion[] = [];
  const dailyScheduled: Record<string, number> = {};
  const dailyDone: Record<string, number> = {};
  for (const dk of keys) {
    dailyScheduled[dk] = 0;
    dailyDone[dk] = 0;
  }

  let completed = 0;
  let scheduled = 0;

  for (const habit of active) {
    const doneSet = new Set(completions?.[habit.id] ?? []);
    const habitSkips = opts.skips?.[habit.id];
    let habitDone = 0;
    let habitScheduled = 0;

    if (isFlexibleHabit(habit)) {
      const byWeek = new Map<string, { done: number; days: number }>();
      for (const dk of keys) {
        if (
          !habitScheduledOnDate(habit, dk, {
            ...scheduleOpts,
            weekDoneCount: 0,
          })
        ) {
          continue;
        }
        if (habitSkips?.[dk] && !doneSet.has(dk)) continue;
        const weekStart = weekStartKeyForDateKey(dk);
        const row = byWeek.get(weekStart) ?? { done: 0, days: 0 };
        row.days += 1;
        if (doneSet.has(dk)) row.done += 1;
        byWeek.set(weekStart, row);
      }
      for (const [weekStart, row] of byWeek) {
        const target = Math.min(
          row.days,
          weeklyTargetForDate(habit, weekEndKeyForDateKey(weekStart)),
        );
        habitScheduled += target;
        habitDone += Math.min(row.done, target);
      }
      completed += habitDone;
      scheduled += habitScheduled;
      perHabit.push({
        id: habit.id,
        name: habit.name || "Звичка",
        done: habitDone,
        scheduled: habitScheduled,
        completionRate: pctOf(habitDone, habitScheduled),
      });
      continue;
    }

    for (const dk of keys) {
      if (!habitScheduledOnDate(habit, dk, scheduleOpts)) continue;
      // «Не зміг з причиною» виходить зі знаменника, а не рахується
      // провалом (канон §5) — та сама гілка, що в `completionRateForRange`.
      if (habitSkips?.[dk] && !doneSet.has(dk)) continue;
      habitScheduled += 1;
      dailyScheduled[dk] = (dailyScheduled[dk] ?? 0) + 1;
      if (doneSet.has(dk)) {
        habitDone += 1;
        dailyDone[dk] = (dailyDone[dk] ?? 0) + 1;
      }
    }

    completed += habitDone;
    scheduled += habitScheduled;
    perHabit.push({
      id: habit.id,
      name: habit.name || "Звичка",
      done: habitDone,
      scheduled: habitScheduled,
      completionRate: pctOf(habitDone, habitScheduled),
    });
  }

  const daily: Record<string, number> = {};
  for (const dk of keys) {
    // День, на який нічого не заплановано, — 0%, а не «провал»: знаменник
    // порожній, і споживач читає його як «нічого не заплановано» (той самий
    // контракт, що й у `buildHeatmapGrid` із `denominator: "scheduled"`).
    daily[dk] = pctOf(dailyDone[dk] ?? 0, dailyScheduled[dk] ?? 0);
  }

  return {
    completed,
    scheduled,
    pct: pctOf(completed, scheduled),
    daily,
    perHabit,
  };
}

function pctOf(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
