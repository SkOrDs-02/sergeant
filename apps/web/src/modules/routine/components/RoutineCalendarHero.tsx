/**
 * Last validated: 2026-05-18
 * Status: Active
 */
import { Card } from "@shared/components/ui/Card";
import { HeroValueLine } from "@shared/components/ui/HeroValueLine";
import { KpiRowCompact } from "@shared/components/ui/KpiRowCompact";
import { CounterReveal } from "@shared/components/ui/CounterReveal";
import { DayProgressRing } from "./DayProgressRing";

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
  filteredCount,
  activeHabitsCount,
  completionRate,
  currentStreak,
  onOpenDayReport,
}: RoutineCalendarHeroProps) {
  const narrative = `${headlineDate} · ${dayProgress.completed} з ${dayProgress.scheduled} звичок · Серія ${currentStreak} днів`;

  return (
    <Card
      as="section"
      prominence="hero"
      module="routine"
      radius="r-2xl"
      aria-label={rangeLabel}
    >
      <HeroValueLine
        narrative={narrative}
        metric={
          <CounterReveal
            value={dayProgress.completed}
            max={dayProgress.scheduled}
            entranceFrom={0}
            duration={800}
          />
        }
        ring={
          <DayProgressRing
            completed={dayProgress.completed}
            scheduled={dayProgress.scheduled}
            onClick={onOpenDayReport}
          />
        }
      />
      <KpiRowCompact
        module="routine"
        items={[
          { label: "Подій", value: filteredCount },
          { label: "Звичок", value: activeHabitsCount },
          {
            label: "Виконання",
            value: `${Math.round(completionRate.rate * 100)}%`,
          },
          { label: "Серія", value: currentStreak },
        ]}
      />
    </Card>
  );
}
