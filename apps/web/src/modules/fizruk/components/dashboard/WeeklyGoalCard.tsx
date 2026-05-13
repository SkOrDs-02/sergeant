/**
 * WeeklyGoalCard — прогрес до тижневої цілі тренувань.
 *
 * Читає ціль напряму з `hub_goals_v1` (localStorage) — беремо
 * останній запис де `workoutsPerWeek` визначено. Якщо цілі немає —
 * використовуємо дефолт 3 тренування на тиждень.
 */

import { useMemo } from "react";
import { Card } from "@shared/components/ui/Card";
import { messages } from "@shared/i18n/uk";
import { ls } from "../../../../core/lib/hubChatUtils";

interface WeeklyGoalCardProps {
  readonly weeklyCount: number;
  readonly onOpenWorkouts: () => void;
}

function getWeeklyGoal(): number {
  const goals = ls<Array<{ workoutsPerWeek?: number; createdAt: string }>>(
    "hub_goals_v1",
    [],
  );
  const withGoal = [...goals]
    .reverse()
    .find((g) => g.workoutsPerWeek != null && Number(g.workoutsPerWeek) > 0);
  return withGoal ? Number(withGoal.workoutsPerWeek) : 3;
}

function DayDot({ filled, today }: { filled: boolean; today?: boolean }) {
  return (
    <div
      className={[
        "w-7 h-7 rounded-full flex items-center justify-center text-2xs font-semibold transition-colors",
        filled
          ? "bg-fizruk-strong text-white"
          : today
            ? "border-2 border-fizruk/40 text-muted"
            : "bg-panelHi text-subtle",
      ].join(" ")}
      aria-hidden
    />
  );
}

export function WeeklyGoalCard({
  weeklyCount,
  onOpenWorkouts,
}: WeeklyGoalCardProps) {
  const goal = useMemo(() => getWeeklyGoal(), []);
  const done = Math.min(weeklyCount, goal);
  const pct = goal > 0 ? Math.round((done / goal) * 100) : 0;

  const label = useMemo(() => {
    if (done === 0) return "Почни тиждень з тренування";
    if (done >= goal) return "Тижневу ціль виконано!";
    const left = goal - done;
    if (left === 1) return "Ще одне — і ціль виконана";
    return `Залишилось ${left} тренування`;
  }, [done, goal]);

  const tone =
    done >= goal ? "text-fizruk" : done > 0 ? "text-text" : "text-subtle";

  return (
    <button
      type="button"
      onClick={onOpenWorkouts}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/50 rounded-2xl"
      aria-label={`Прогрес тижня: ${done} з ${goal} тренувань. Відкрити тренування`}
    >
      <Card
        module="fizruk"
        prominence="tinted"
        padding="md"
        radius="xl"
        className="space-y-3 hover:brightness-[0.97] active:scale-[0.99] transition-[transform,filter]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-fizruk/15 shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-fizruk"
                aria-hidden
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </span>
            <span className="text-style-label text-text">
              {messages.fizruk.dashboard.weeklyGoalTitle}
            </span>
          </div>
          <span className={`text-xs font-semibold ${tone}`}>
            {done}/{goal}
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-2 bg-fizruk/15 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% виконано`}
        >
          <div
            className="h-full bg-fizruk rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Dots */}
        <div className="flex gap-1.5">
          {Array.from({ length: goal }).map((_, i) => (
            <DayDot
              key={i}
              filled={i < done}
              today={i === done && done < goal}
            />
          ))}
        </div>

        {/* Label */}
        <p className="text-xs text-subtle">{label}</p>
      </Card>
    </button>
  );
}
