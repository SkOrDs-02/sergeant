import { memo, useId } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ROUTINE_THEME as C, WEEKDAY_LABELS } from "../../lib/routineConstants";
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
      <p id={labelId} className="text-xs text-subtle mb-2">
        {messages.routine.weekdays}
      </p>
      <div
        className="flex flex-wrap gap-2"
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
                "min-h-[44px] min-w-[44px] px-3 rounded-xl text-xs font-semibold border transition-colors",
                on ? C.chipOn : C.chipOff,
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
