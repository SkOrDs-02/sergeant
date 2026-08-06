/**
 * Last validated: 2026-08-03
 * Status: Active
 */
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
    <div
      role="group"
      aria-label="Тиждень"
      className="flex items-center gap-1.5 sm:gap-2"
    >
      <IconButton
        size="md"
        variant="ghost"
        className="focus-ring shrink-0 rounded-xl border border-line bg-panel/90 text-lg! text-muted"
        onClick={() => onShiftWeek(-1)}
        aria-label="Попередній тиждень"
      >
        ‹
      </IconButton>
      {/* Keep selection repaints immediate inside the overflow scroller.
          WebKit can retain split raster tiles when a day background changes
          during smooth scroll snapping or a colour transition. */}
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1.5 sm:gap-2">
          {keys.map((k, i) => {
            const isSel = k === selectedDay;
            const isToday = k === todayKey;
            const dom = Number(k.slice(8, 10));
            return (
              <button
                key={k}
                type="button"
                aria-pressed={isSel}
                onClick={() => onSelectDay(k)}
                className={cn(
                  // Розміру шрифта на кнопці НЕМАЄ навмисно: обидва вкладені
                  // span-и задають свій (`text-style-caption` і `text-sm`),
                  // тож роль на батьку не діяла ні на що — крім того, що
                  // вступала в конфлікт ваги з `font-semibold` тут-таки.
                  // `sm:text-xs` було мертвим кодом: 12px == 12px.
                  "focus-ring flex min-h-[44px] min-w-[44px] flex-1 shrink-0 flex-col items-center justify-center rounded-xl border py-1 font-semibold",
                  isSel
                    ? "border-routine-ring dark:border-routine-border-dark/40 bg-routine-surface2 dark:bg-routine-surface-dark/15 text-text shadow-sm ring-1 ring-routine-line/50 dark:ring-routine-border-dark/30"
                    : "border-transparent bg-panelHi/50 text-muted hover:bg-panelHi hover:text-text",
                  isToday && !isSel && "ring-1 ring-routine/40",
                )}
              >
                {/* AI-DANGER: капс тут лишається навмисно, попри правило 4
                    типографіки тексту. Правило б'є по кікерах — службових
                    рядках зі СЛІВ, які втрачають силует у верхньому
                    регістрі. Тут дволітерні скорочення днів (Пн, Вт), у
                    яких силуету немає в жодному регістрі, а капс тримає
                    рівну висоту в сітці календаря. Не «дочищай». */}
                <span className="text-style-caption uppercase tracking-wide text-subtle">
                  {short[i]}
                </span>
                <span className="tabular-nums text-sm text-text">{dom}</span>
              </button>
            );
          })}
        </div>
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
