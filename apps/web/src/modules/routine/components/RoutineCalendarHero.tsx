import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { DayProgressRing } from "./DayProgressRing";
import { ROUTINE_THEME as C } from "../lib/routineConstants";

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
 * Top "hero" card for the Routine calendar tab. Combines the period
 * label, headline date, the daily progress ring (clickable to open
 * the day report sheet), and four KPI tiles: events in range, active
 * habits, completion %, current streak.
 *
 * Layout is intentionally responsive: ring + tiles stack on mobile,
 * lay out side-by-side from `sm:` upwards. The 4 tiles wrap from
 * 2-col → 4-col at `lg:` so the period KPI doesn't compete with the
 * page-tabbar at narrow widths.
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
  return (
    <Card
      as="section"
      variant="routine"
      padding="lg"
      aria-label="Огляд періоду"
    >
      <p
        className={cn(
          // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Calendar hero kicker composed with dynamic C.heroKicker routine tint; see RoutineApp header for the sibling pattern.
          "text-xs font-bold tracking-widest uppercase",
          C.heroKicker,
        )}
      >
        {rangeLabel}
      </p>
      <p className="text-xs text-subtle mt-1">{headlineDate}</p>
      <div className="mt-4 flex flex-col sm:flex-row items-center gap-4">
        <DayProgressRing
          completed={dayProgress.completed}
          scheduled={dayProgress.scheduled}
          onClick={onOpenDayReport}
        />
        <div className="flex-1 grid grid-cols-2 gap-2 w-full sm:grid-cols-2 lg:grid-cols-4">
          <div className={C.statCard}>
            <SectionHeading as="p" size="xs" variant="subtle">
              Подій у зрізі
            </SectionHeading>
            <p className="text-2xl font-black text-text tabular-nums mt-0.5">
              {filteredCount}
            </p>
          </div>
          <div className={C.statCard}>
            <SectionHeading as="p" size="xs" variant="subtle">
              Звичок активних
            </SectionHeading>
            <p className="text-2xl font-black text-text tabular-nums mt-0.5">
              {activeHabitsCount}
            </p>
          </div>
          <div className={C.statCard}>
            <SectionHeading as="p" size="xs" variant="subtle">
              Виконання
            </SectionHeading>
            <p className="text-2xl font-black text-text tabular-nums mt-0.5">
              {Math.round(completionRate.rate * 100)}%
            </p>
            <p className="text-2xs text-subtle tabular-nums">
              {completionRate.completed}/{completionRate.scheduled}
            </p>
          </div>
          <div className={C.statCard}>
            <SectionHeading as="p" size="xs" variant="subtle">
              Поточна серія
            </SectionHeading>
            <p className="text-2xl font-black text-text tabular-nums mt-0.5">
              {currentStreak}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
