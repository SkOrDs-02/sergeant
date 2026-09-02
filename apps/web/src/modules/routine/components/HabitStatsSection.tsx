/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useMemo } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { HabitSkip } from "@sergeant/routine-domain";
import {
  dateKeyMinusDays,
  isFlexibleHabit,
  weeklyGoalStreakBreakdown,
} from "@sergeant/routine-domain";
import {
  flexibleStreakBreakdown,
  habitCompletionRate,
  maxStreakAllTime,
} from "../lib/streaks";
import { ROUTINE_THEME as C } from "../lib/routineConstants";
import type { Habit } from "../lib/types";

/**
 * Rolling `days`-window completion percentage, delegated to the canonical
 * `habitCompletionRate` (unification audit 2026-08-31, finding 1.23):
 * without it, this card's own loop skipped the `once`-habit exclusion
 * (`habitCountsTowardMetrics`) that the rest of the module already
 * respects, so a one-off event showed a percentage nowhere else in the
 * product does. `habitCompletionRate` doesn't accept `skips` either, so
 * part of the divergence from the hero (which does) remains until that
 * option lands here too.
 */
function completionPct(
  habit: Habit,
  completions: string[],
  todayKey: string,
  days: number,
): number | null {
  const { scheduled, rate } = habitCompletionRate(
    habit,
    completions,
    dateKeyMinusDays(todayKey, days - 1),
    todayKey,
  );
  if (scheduled === 0) return null;
  return Math.round(rate * 100);
}

export interface HabitStatsSectionProps {
  habit: Habit;
  completions: string[];
  todayKey: string;
  /** `skips?.[habit.id]` — пропуски саме цієї звички. */
  skips?: Record<string, HabitSkip> | undefined;
  /**
   * Для `once` серій і відсотків не існує (канон §7 п.2, рішення
   * 2026-08-30): разова подія — не послідовність днів. Лишається лише
   * «Разів виконано».
   */
  isOnce: boolean;
}

export function HabitStatsSection({
  habit,
  completions,
  todayKey,
  skips,
  isOnce,
}: HabitStatsSectionProps) {
  // Гнучкий стрік (канон §4): показуємо не лише число, а й з чого воно
  // склалось — інакше «серія 12» при двох днях відпустки всередині
  // виглядає як помилка підрахунку.
  const streak = useMemo(
    () =>
      flexibleStreakBreakdown(habit, completions, todayKey, {
        skipsForHabit: skips,
      }),
    [habit, completions, todayKey, skips],
  );
  // Гнучка звичка («N разів на тиждень») міряється тижнями, не днями.
  // `flexibleStreakBreakdown` вище — це ІНША гнучкість: поденна серія з
  // бюджетом прощень. Прогнати через неї звичку, яка й не планується щодня,
  // означає порахувати пропуском кожен день, у який людина нічого й не мала
  // робити. Назви збігаються, сутності різні.
  const weeklyStreak = useMemo(
    () =>
      isFlexibleHabit(habit)
        ? weeklyGoalStreakBreakdown(habit, completions, todayKey)
        : null,
    [habit, completions, todayKey],
  );
  const isFlex = weeklyStreak !== null;
  const currentStreak = isFlex ? weeklyStreak.weeks : streak.days;
  // AI-CONTEXT: тут був `streakHint` — рядок «пауза: 2 дн. · не зміг: 1 дн. ·
  // заморозки: 1» під числом серії. Прибрано 2026-08-05 разом із додаванням
  // `HabitStreakCanvas` вище: полотно показує ті самі пʼять типів дня формою
  // клітинки, тобто видно, ЯКІ саме дні були паузою, а не лише скільки їх.
  // Тримати обидва означало б лишити рівно той патерн, який полотно й
  // заміняє — одне число плюс текстове виправдання під ним
  // (`docs/05-design/design/anti-slop-strategy.md` §5 P3).
  const bestStreak = useMemo(
    () => maxStreakAllTime(habit, completions),
    [habit, completions],
  );
  const totalDone = completions.length;

  const pct7 = useMemo(
    () => completionPct(habit, completions, todayKey, 7),
    [habit, completions, todayKey],
  );
  const pct30 = useMemo(
    () => completionPct(habit, completions, todayKey, 30),
    [habit, completions, todayKey],
  );
  const pct90 = useMemo(
    () => completionPct(habit, completions, todayKey, 90),
    [habit, completions, todayKey],
  );

  return (
    <section className="mb-5" aria-label="Статистика">
      <SectionHeading as="h3" size="xs" className="mb-2" variant="routine">
        Статистика
      </SectionHeading>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {!isOnce && (
          <div className={C.statCard}>
            <p className="text-style-headline text-text tabular-nums">
              {currentStreak}
            </p>
            <p className="text-style-caption text-subtle mt-0.5">
              {isFlex ? "Тижнів поспіль" : "Поточна серія"}
            </p>
          </div>
        )}
        {!isOnce && (
          <div className={C.statCard}>
            <p className="text-style-headline text-text tabular-nums">
              {bestStreak}
            </p>
            <p className="text-style-caption text-subtle mt-0.5">
              {isFlex ? "Макс тижнів" : "Макс серія"}
            </p>
          </div>
        )}
        {isFlex && (
          <div className={C.statCard}>
            <p className="text-style-headline text-text tabular-nums">
              {weeklyStreak.currentWeekWorkouts} з {weeklyStreak.targetPerWeek}
            </p>
            <p className="text-style-caption text-subtle mt-0.5">Цього тижня</p>
          </div>
        )}
        <div className={C.statCard}>
          <p className="text-style-headline text-text tabular-nums">
            {totalDone}
          </p>
          <p className="text-style-caption text-subtle mt-0.5">
            Разів виконано
          </p>
        </div>
        {!isOnce && (
          <div className={C.statCard}>
            <div className="flex items-baseline justify-center gap-1.5">
              {pct7 !== null && (
                <Measure
                  value={pct7}
                  unit="%"
                  className="text-style-label text-text"
                />
              )}
              {pct30 !== null && (
                <Measure
                  value={pct30}
                  unit="%"
                  className="text-style-caption text-muted"
                />
              )}
              {pct90 !== null && (
                <Measure
                  value={pct90}
                  unit="%"
                  className="text-style-caption text-subtle"
                />
              )}
              {pct7 === null && pct30 === null && pct90 === null && (
                <span className="text-style-label text-muted">—</span>
              )}
            </div>
            <p className="text-style-caption text-subtle mt-0.5">
              % за 7 / 30 / 90 д
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
