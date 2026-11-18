/**
 * Рядок дня звички з лічильником (Р-1 (а), міграція 170): «−», «2 з 3» і
 * «+». Замінює кружок стану для такої звички.
 *
 * Правила — у домені (`counterHabit.ts`): «2 з 3» не виконано, після цілі
 * рахує далі («4 з 3»), крок угору не знімає відмітку. Майбутній день
 * заблокований так само, як кружок (`HabitStateButton.futureDay`).
 * Кнопки по 44×44, як кружок.
 */
import { counterProgressLabel } from "@sergeant/routine-domain";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";

import { FUTURE_DAY_LABEL } from "./HabitStateButton";

const M = messages.routine.counter;

export interface HabitCounterControlProps {
  name: string;
  count: number;
  target: number;
  unit?: string | undefined;
  done: boolean;
  futureDay: boolean;
  onStep: (delta: number) => void;
}

export function HabitCounterControl({
  name,
  count,
  target,
  unit,
  done,
  futureDay,
  onStep,
}: HabitCounterControlProps) {
  const progress = counterProgressLabel(count, target);
  const btn =
    "focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-style-label-lg font-semibold disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div
      className="flex items-center"
      data-habit-state={done ? "done" : futureDay ? "future" : "open"}
    >
      <button
        type="button"
        className={btn}
        disabled={count === 0}
        aria-label={M.decrement.replace("{name}", name)}
        onClick={() => onStep(-1)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span
        className={cn(
          "min-w-[3.5rem] text-center tabular-nums text-style-label",
          done ? "font-semibold text-text" : "text-muted",
        )}
        aria-live="polite"
        aria-label={M.progressAria
          .replace("{name}", name)
          .replace("{progress}", unit ? `${progress} ${unit}` : progress)}
      >
        {progress}
      </span>
      <button
        type="button"
        className={btn}
        disabled={futureDay}
        aria-label={
          futureDay ? FUTURE_DAY_LABEL : M.increment.replace("{name}", name)
        }
        onClick={() => onStep(1)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </div>
  );
}
