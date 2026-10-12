import { useMemo, useState } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { habitCompletionRate } from "../lib/streaks";
import { anchoredTodayKey } from "../lib/dayAnchor";
import { dateKeyFromDate } from "@sergeant/routine-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import type { Habit, RoutineState } from "../lib/types";

export interface HabitLeadersBlockProps {
  habits: Habit[];
  completions: RoutineState["completions"];
}

export function HabitLeadersBlock({
  habits,
  completions,
}: HabitLeadersBlockProps) {
  const [windowStartMs] = useState(() => Date.now() - 29 * 86_400_000);

  const { best, worst } = useMemo(() => {
    const active = habits.filter((h) => !h.archived);
    if (active.length === 0) return { best: null, worst: null };

    // Device-local inclusive 30-day window (today + 29 days back),
    // same anchor as the rest of web-routine (ADR-0078, cutover 2026-09-01).
    const endKey = anchoredTodayKey();
    const startKey = dateKeyFromDate(new Date(windowStartMs));

    const rates = active
      .map((h) => {
        const r = habitCompletionRate(
          h,
          completions[h.id] || [],
          startKey,
          endKey,
        );
        return { habit: h, ...r };
      })
      .filter((r) => r.scheduled > 0);

    if (rates.length === 0) return { best: null, worst: null };

    rates.sort((a, b) => b.rate - a.rate);
    const best = rates[0];
    const worst = rates.length > 1 ? rates[rates.length - 1] : null;

    if (best && worst && worst.habit.id === best.habit.id)
      return { best, worst: null };

    return { best, worst };
  }, [habits, completions, windowStartMs]);

  if (!best) return null;

  return (
    <Card>
      <SectionHeading as="p" size="lg" className="mb-3">
        Найстабільніша й найслабша · 30 днів
      </SectionHeading>
      <div className="divide-y divide-line">
        <div className="py-3">
          <p className="text-style-label text-muted mb-1">Найстабільніша</p>
          <p className="text-style-label-lg font-semibold text-text flex items-center gap-1.5 truncate">
            <span className="truncate">{best.habit.name}</span>
          </p>
          <p className="text-style-label text-muted mt-0.5 tabular-nums">
            <Measure value={Math.round(best.rate * 100)} unit="%" /> ·{" "}
            {best.completed}/{best.scheduled}
          </p>
        </div>
        {worst && (
          <div className="py-3">
            <p className="text-style-label text-muted mb-1">Найслабша</p>
            <p className="text-style-label-lg font-semibold text-text flex items-center gap-1.5 truncate">
              <span className="truncate">{worst.habit.name}</span>
            </p>
            <p className="text-style-label text-muted mt-0.5 tabular-nums">
              <Measure value={Math.round(worst.rate * 100)} unit="%" /> ·{" "}
              {worst.completed}/{worst.scheduled}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
