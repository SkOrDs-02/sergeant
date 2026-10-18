import { memo, useId } from "react";
import { cn } from "@shared/lib/ui/cn";
import { WEEKDAY_LABELS } from "../../lib/routineConstants";
import { messages } from "@shared/i18n/uk";

export interface WeekdayPickerProps {
  weekdays: number[] | null | undefined;
  onChange: (next: number[]) => void;
}

export const WeekdayPicker = memo(function WeekdayPicker({
  weekdays,
  onChange,
}: WeekdayPickerProps) {
  const active = weekdays || [];
  const labelId = useId();
  return (
    <div>
      <p id={labelId} className="text-style-caption text-subtle mb-2">
        {messages.routine.weekdays}
      </p>
      <div
        className="divide-y divide-line"
        role="group"
        aria-labelledby={labelId}
      >
        {WEEKDAY_LABELS.map((label, wd) => {
          const on = active.includes(wd);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const cur = [...active];
                const i = cur.indexOf(wd);
                if (i >= 0) {
                  if (cur.length <= 1) return;
                  cur.splice(i, 1);
                } else cur.push(wd);
                cur.sort((a, b) => a - b);
                onChange(cur);
              }}
              className={cn(
                "flex min-h-11 w-full items-center justify-between py-2 text-left text-style-label-lg focus-ring",
                on ? "font-semibold text-text" : "text-muted",
              )}
            >
              <span>{label}</span>
              <span aria-hidden>{on ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});
