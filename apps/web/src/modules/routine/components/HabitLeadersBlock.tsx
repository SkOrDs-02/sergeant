import { useMemo, useState } from "react";
import { habitCompletionRate } from "../lib/streaks";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
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

    // Kyiv-anchored inclusive 30-day window (today + 29 days back).
    const endKey = getKyivDayKey();
    const startKey = getKyivDayKey(windowStartMs);

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
    <Card radius="lg">
      <SectionHeading as="p" size="sm" className="mb-3">
        Лідери та аутсайдери (30 днів)
      </SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-routine-line/40 dark:border-routine-border-dark/20 bg-routine-surface/30 dark:bg-routine-surface-dark/8 p-3">
          <SectionHeading as="p" size="xs" variant="subtle" className="mb-1">
            Найстабільніша
          </SectionHeading>
          <p className="text-style-label text-text truncate">
            {best.habit.emoji} {best.habit.name}
          </p>
          <p className="text-xs text-subtle mt-0.5 tabular-nums">
            {Math.round(best.rate * 100)}% · {best.completed}/{best.scheduled}
          </p>
        </div>
        {worst && (
          <div className="rounded-xl border border-line bg-panel p-3">
            <SectionHeading as="p" size="xs" variant="subtle" className="mb-1">
              Найслабша
            </SectionHeading>
            <p className="text-style-label text-text truncate">
              {worst.habit.emoji} {worst.habit.name}
            </p>
            <p className="text-xs text-subtle mt-0.5 tabular-nums">
              {Math.round(worst.rate * 100)}% · {worst.completed}/
              {worst.scheduled}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
