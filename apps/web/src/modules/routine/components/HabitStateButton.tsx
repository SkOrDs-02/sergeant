import type { ButtonHTMLAttributes } from "react";
import { cn } from "@shared/lib/ui/cn";

/** Кружок — стан звички; 22px всередині зони натиску 44×44. */
export function HabitStateButton({
  completed,
  paused = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  completed: boolean;
  paused?: boolean;
}) {
  return (
    <button
      {...props}
      type="button"
      className={cn(
        "focus-ring flex h-11 w-11 shrink-0 items-center justify-center",
        className,
      )}
      aria-pressed={completed}
      data-habit-state={paused ? "pause" : completed ? "done" : "open"}
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
