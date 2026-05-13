import { cn } from "@shared/lib/ui/cn";
import { IconButton } from "@shared/components/ui/IconButton";
import {
  addDays,
  dateKeyFromDate,
  parseDateKey,
  startOfIsoWeek,
} from "../lib/weekUtils";

function weekKeysFromAnchor(anchorKey: string): string[] {
  const s = startOfIsoWeek(parseDateKey(anchorKey));
  return Array.from({ length: 7 }, (_, i) => dateKeyFromDate(addDays(s, i)));
}

export interface WeekDayStripProps {
  anchorKey: string;
  selectedDay: string;
  todayKey: string;
  onSelectDay: (dateKey: string) => void;
  onShiftWeek: (delta: number) => void;
}

export function WeekDayStrip({
  anchorKey,
  selectedDay,
  todayKey,
  onSelectDay,
  onShiftWeek,
}: WeekDayStripProps) {
  const keys = weekKeysFromAnchor(anchorKey);
  const short = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <IconButton
        size="md"
        variant="ghost"
        className="focus-ring shrink-0 rounded-xl border border-line bg-panel/90 text-lg! text-muted"
        onClick={() => onShiftWeek(-1)}
        aria-label="Попередній тиждень"
      >
        ‹
      </IconButton>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5 sm:gap-1">
        {keys.map((k, i) => {
          const isSel = k === selectedDay;
          const isToday = k === todayKey;
          const dom = parseDateKey(k).getDate();
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelectDay(k)}
              className={cn(
                "focus-ring flex min-h-[44px] flex-col items-center justify-center rounded-xl border py-1 text-2xs font-semibold transition-colors sm:text-xs",
                isSel
                  ? "border-routine-ring dark:border-routine-border-dark/40 bg-routine-surface2 dark:bg-routine-surface-dark/15 text-text shadow-sm ring-1 ring-routine-line/50 dark:ring-routine-border-dark/30"
                  : "border-transparent bg-panelHi/50 text-muted hover:bg-panelHi hover:text-text",
                isToday && !isSel && "ring-1 ring-routine/40",
              )}
            >
              {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
                  Day-of-week caption at text-2xs inside a compact day-picker
                  tile — smaller than SectionHeading xs's text-2xs. */}
              <span className="text-2xs uppercase tracking-wide text-subtle">
                {short[i]}
              </span>
              <span className="tabular-nums text-sm text-text">{dom}</span>
            </button>
          );
        })}
      </div>
      <IconButton
        size="md"
        variant="ghost"
        className="focus-ring shrink-0 rounded-xl border border-line bg-panel/90 text-lg! text-muted"
        onClick={() => onShiftWeek(1)}
        aria-label="Наступний тиждень"
      >
        ›
      </IconButton>
    </div>
  );
}
