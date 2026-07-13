/**
 * Last validated: 2026-05-19
 * Status: Active
 */
import { pluralDays } from "@sergeant/shared";
import { Card } from "@shared/components/ui/Card";
import { StreakFlame } from "@shared/components/ui/StreakFlame";
import { DayProgressRing } from "./DayProgressRing";
import { useStreakFlame } from "../hooks/useStreakFlame";

export interface RoutineCalendarHeroProps {
  rangeLabel: string;
  headlineDate: string;
  dayProgress: { completed: number; scheduled: number };
  filteredCount: number;
  activeHabitsCount: number;
  completionRate: { rate: number; completed: number; scheduled: number };
  currentStreak: number;
  onOpenDayReport: () => void;
}

/**
 * Top "hero" card for the Routine calendar tab. Uses the v2 hero Card
 * shell (prominence="hero" module="routine" radius="r-2xl") with:
 *
 *   - `HeroValueLine` — narrative sentence (date · progress · streak),
 *     animated `CounterReveal` metric, and the `DayProgressRing` (ring
 *     slot, clickable to open the day-report sheet).
 *   - `KpiRowCompact` — one-row compact meta strip: events in range,
 *     active habits, completion %, current streak.
 *
 * Props interface is unchanged from v1; all call sites remain compatible.
 */
export function RoutineCalendarHero({
  rangeLabel,
  headlineDate,
  dayProgress,
  currentStreak,
  onOpenDayReport,
}: RoutineCalendarHeroProps) {
  const habitsGenitive = dayProgress.scheduled === 1 ? "звички" : "звичок";
  const progressText =
    dayProgress.scheduled > 0
      ? `${dayProgress.completed} з ${dayProgress.scheduled} ${habitsGenitive} виконано`
      : "Звичок на сьогодні ще немає";
  const flame = useStreakFlame(currentStreak);

  return (
    <Card
      as="section"
      prominence="hero"
      module="routine"
      radius="r-2xl"
      aria-label={rangeLabel}
      className="routine-hero relative"
    >
      {flame.visible && (
        <span
          className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-hidden="true"
        >
          <StreakFlame streak={flame.count} size="sm" />
        </span>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex shrink-0 items-center justify-center">
          <DayProgressRing
            completed={dayProgress.completed}
            scheduled={dayProgress.scheduled}
            onClick={onOpenDayReport}
          />
        </div>
        <div className="min-w-0 flex-1 pr-12">
          <p className="text-style-caption font-semibold text-hero-ink/65">
            Сьогоднішні звички
          </p>
          <p className="mt-1 text-style-headline text-hero-ink">
            {headlineDate}
          </p>
          <p className="mt-2 text-style-body-sm text-hero-ink/75">
            {progressText}
            {currentStreak > 0
              ? ` · серія ${currentStreak} ${pluralDays(currentStreak)}`
              : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}
