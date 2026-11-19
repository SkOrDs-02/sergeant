import type { ButtonHTMLAttributes } from "react";
import { cn } from "@shared/lib/ui/cn";

/** Доступне імʼя заблокованого кружка майбутнього дня. */
export const FUTURE_DAY_LABEL = "Відмітити можна в сам день, він ще попереду";

/** Кружок — стан звички; 22px всередині зони натиску 44×44. */
export function HabitStateButton({
  completed,
  paused = false,
  futureDay = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  completed: boolean;
  paused?: boolean;
  /**
   * День у майбутньому. Постановку відмітки домен відхиляє мовчки
   * (`applyToggleHabitCompletion`), тож без цього кружок виглядав живим,
   * а тап не робив нічого. Знімати вже наявну відмітку дозволено, тому
   * для `completed` проп ігнорується.
   */
  futureDay?: boolean;
}) {
  const locked = futureDay && !completed;
  return (
    <button
      {...props}
      type="button"
      disabled={locked || props.disabled}
      aria-label={locked ? FUTURE_DAY_LABEL : props["aria-label"]}
      className={cn(
        "focus-ring flex h-11 w-11 shrink-0 items-center justify-center",
        locked && "cursor-not-allowed opacity-50",
        className,
      )}
      aria-pressed={completed}
      data-habit-state={
        paused ? "pause" : completed ? "done" : locked ? "future" : "open"
      }
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[22px] w-[22px] items-center justify-center rounded-full border text-style-caption font-bold",
          paused
            ? "border-dashed border-muted"
            : completed
              ? "border-text bg-text text-bg"
              : "border-muted",
        )}
      >
        {completed ? "✓" : null}
      </span>
    </button>
  );
}
