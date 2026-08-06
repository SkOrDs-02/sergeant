import { useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Stat } from "@shared/components/ui/Stat";
import { HabitHeatmap } from "./HabitHeatmap";
import { HabitLeadersBlock } from "./HabitLeadersBlock";
import { completionRateForRange, maxStreakAllTime } from "../lib/streaks";
import { dateKeyFromDate, parseDateKey } from "../lib/hubCalendarAggregate";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import { ROUTINE_THEME as C } from "../lib/routineConstants";
import type { RoutineState } from "../lib/types";

function dateKeyMinusDays(baseKey: string, daysBack: number): string {
  const d = parseDateKey(baseKey);
  // Календарна арифметика на вже київському ключі (`baseKey` приходить з
  // `getKyivDayKey`), а не читання host-local доби — зсув на N днів назад.
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- calendar arithmetic on a Kyiv-anchored key; not a host day key
  d.setDate(d.getDate() - daysBack);
  d.setHours(12, 0, 0, 0);
  return dateKeyFromDate(d);
}

export interface RoutineStatsPanelProps {
  routine: RoutineState;
  currentStreak: number;
  hidden?: boolean;
}

export function RoutineStatsPanel({
  routine,
  currentStreak,
  hidden,
}: RoutineStatsPanelProps) {
  // Kyiv-anchored "today" so day-aggregated stats don't shift around
  // host TZ (consolidated page-audit § Theme 1 — 09 F3).
  const todayKey = getKyivDayKey();

  const summary = useMemo(() => {
    const habits = routine.habits || [];
    const completions = routine.completions || {};
    const maxAllTime = habits.reduce((acc: number, h) => {
      if (h.archived) return acc;
      const m = maxStreakAllTime(h, completions[h.id] || []);
      return m > acc ? m : acc;
    }, 0);
    // `pausedFrom: todayKey` — заморозка минулого (ADR-0079 §2). Саме тут вона
    // найпомітніша: 7/30/90-денні зрізи цілком лежать у минулому, тож без
    // параметра пауза, поставлена сьогодні, обнуляла б їх усі три одразу.
    const freeze = { pausedFrom: todayKey };
    const r7 = completionRateForRange(
      habits,
      completions,
      dateKeyMinusDays(todayKey, 6),
      todayKey,
      freeze,
    );
    const r30 = completionRateForRange(
      habits,
      completions,
      dateKeyMinusDays(todayKey, 29),
      todayKey,
      freeze,
    );
    const r90 = completionRateForRange(
      habits,
      completions,
      dateKeyMinusDays(todayKey, 89),
      todayKey,
      freeze,
    );
    return { maxAllTime, r7, r30, r90 };
  }, [routine.habits, routine.completions, todayKey]);

  return (
    <div
      role="tabpanel"
      id="routine-panel-stats"
      aria-labelledby="routine-tab-stats"
      hidden={hidden}
      className="space-y-4"
    >
      <Card as="section" radius="lg" aria-label="Зведена статистика">
        <SectionHeading as="p" size="sm" className="mb-3" variant="routine">
          Зведення
        </SectionHeading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div className={C.statCard}>
            <Stat label="Серія сьогодні" value={currentStreak} size="md" />
          </div>
          <div className={C.statCard}>
            <Stat label="Макс. серія" value={summary.maxAllTime} size="md" />
          </div>
          <div className={C.statCard}>
            <Stat
              label="7 днів"
              value={`${Math.round(summary.r7.rate * 100)}%`}
              sublabel={`${summary.r7.completed}/${summary.r7.scheduled}`}
              size="md"
            />
          </div>
          <div className={C.statCard}>
            <Stat
              label="30 днів"
              value={`${Math.round(summary.r30.rate * 100)}%`}
              sublabel={`${summary.r30.completed}/${summary.r30.scheduled}`}
              size="md"
            />
          </div>
          <div className={cn(C.statCard, "col-span-2 sm:col-span-1")}>
            <Stat
              label="90 днів"
              value={`${Math.round(summary.r90.rate * 100)}%`}
              sublabel={`${summary.r90.completed}/${summary.r90.scheduled}`}
              size="md"
            />
          </div>
        </div>
      </Card>

      <HabitHeatmap habits={routine.habits} completions={routine.completions} />

      <HabitLeadersBlock
        habits={routine.habits}
        completions={routine.completions}
      />
    </div>
  );
}
