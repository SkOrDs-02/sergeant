/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useMemo } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Stat } from "@shared/components/ui/Stat";
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
  // (`docs/design/design/anti-slop-strategy.md` §5 P3).
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
      {/* P2-4 (анти-слоп аудит 2026-09-23, хвіст F1 з 2026-09-01): та сама
          «однакові плитки» граматика, яку `RoutineStatsPanel` уже позбувся —
          один hero-показник, решта рядком тексту без власного бокса. */}
      <Card as="div" radius="lg">
        {isOnce ? (
          <Stat label="Разів виконано" value={totalDone} size="md" />
        ) : (
          <Stat
            label={isFlex ? "Тижнів поспіль" : "Поточна серія"}
            value={currentStreak}
            size="md"
          />
        )}
        {!isOnce && (
          <p className="mt-3 flex flex-wrap items-baseline gap-x-1.5 text-style-label text-muted">
            <span>{isFlex ? "Макс тижнів" : "Найдовша серія"}</span>
            <span className="font-semibold text-text tabular-nums">
              {bestStreak}
            </span>
            {isFlex && weeklyStreak && (
              <>
                <span aria-hidden className="text-subtle">
                  ·
                </span>
                <span>Цього тижня</span>
                <span className="font-semibold text-text tabular-nums">
                  {weeklyStreak.currentWeekWorkouts} з{" "}
                  {weeklyStreak.targetPerWeek}
                </span>
              </>
            )}
            <span aria-hidden className="text-subtle">
              ·
            </span>
            <span>Усього</span>
            <span className="font-semibold text-text tabular-nums">
              {totalDone}
            </span>
          </p>
        )}
        {!isOnce && (
          <p className="mt-1 flex flex-wrap items-baseline gap-1.5 text-style-caption text-subtle">
            <span>% за 7 / 30 / 90 д</span>
            {pct7 !== null && (
              <span className="text-style-label text-text tabular-nums">
                {pct7}
              </span>
            )}
            {pct30 !== null && (
              <span className="text-style-caption text-muted tabular-nums">
                {pct30}
              </span>
            )}
            {pct90 !== null && (
              <span className="text-style-caption text-subtle tabular-nums">
                {pct90}
              </span>
            )}
            {pct7 === null && pct30 === null && pct90 === null && (
              <span className="text-style-label text-muted">—</span>
            )}
          </p>
        )}
      </Card>
    </section>
  );
}
