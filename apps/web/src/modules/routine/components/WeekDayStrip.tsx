/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import { formatDayMonth } from "@shared/lib/time/formatDate";
import {
  addDays,
  dateKeyFromDate,
  parseDateKey,
  startOfIsoWeek,
} from "../lib/weekUtils";
import { ROUTINE_OUTLINE_ICON_BUTTON } from "./routineIconButton";

function weekKeysFromAnchor(anchorKey: string): string[] {
  const s = startOfIsoWeek(parseDateKey(anchorKey));
  return Array.from({ length: 7 }, (_, i) => dateKeyFromDate(addDays(s, i)));
}

export interface WeekDayStripProps {
  anchorKey: string;
  selectedDay: string;
  todayKey: string;
  onSelectDay: (dateKey: string) => void;
}

export function WeekDayStrip({
  anchorKey,
  selectedDay,
  todayKey,
  onSelectDay,
}: WeekDayStripProps) {
  const keys = weekKeysFromAnchor(anchorKey);
  const short = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  // Повна назва для aria-label: скорочення «Пн» + число в innerText SR
  // читає як «Пн 3» без місяця — недостатньо для навігації по тижнях.
  const full = [
    "Понеділок",
    "Вівторок",
    "Середа",
    "Четвер",
    "Пʼятниця",
    "Субота",
    "Неділя",
  ];

  return (
    // Keep a grid, never an iOS horizontal compositor scroller. H removes
    // both surrounding panels/padding, leaving 350px at a 390px viewport:
    // seven 44px targets + six 4px gaps fit in one row.
    <div role="group" aria-label="Тиждень">
      <div className="grid grid-cols-7 gap-1">
        {keys.map((k, i) => {
          const isSel = k === selectedDay;
          const isToday = k === todayKey;
          const dom = Number(k.slice(8, 10));
          return (
            <button
              key={k}
              type="button"
              aria-pressed={isSel}
              aria-label={`${full[i]}, ${formatDayMonth(parseDateKey(k))}${isToday ? " (сьогодні)" : ""}`}
              onClick={() => onSelectDay(k)}
              className={cn(
                "focus-ring flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center border-b-2 py-1",
                isSel
                  ? "border-text font-bold text-text"
                  : "border-transparent text-muted",
                isToday && !isSel && "underline underline-offset-4",
              )}
            >
              {/* AI-DANGER: капс тут лишається навмисно, попри правило 4
                    типографіки тексту. Правило бʼє по кікерах — службових
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
  );
}

export interface WeekShiftControlsProps {
  onShiftWeek: (delta: number) => void;
}

/**
 * Кнопки «попередній / наступний тиждень». Жили в одному рядку з днями,
 * але з переходом стрічки на сітку (див. `AI-DANGER` вище) переїхали в
 * рядок заголовка «Тиждень»: у ряду днів вони забирали 100px із 332
 * доступних і були головною причиною, чому сім клітинок туди не влазили.
 */
export function WeekShiftControls({ onShiftWeek }: WeekShiftControlsProps) {
  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        size="md"
        variant="ghost"
        className={cn("shrink-0", ROUTINE_OUTLINE_ICON_BUTTON)}
        onClick={() => onShiftWeek(-1)}
        aria-label="Попередній тиждень"
      >
        <Icon name="chevron-left" size="sm" />
      </IconButton>
      <IconButton
        size="md"
        variant="ghost"
        className={cn("shrink-0", ROUTINE_OUTLINE_ICON_BUTTON)}
        onClick={() => onShiftWeek(1)}
        aria-label="Наступний тиждень"
      >
        <Icon name="chevron-right" size="sm" />
      </IconButton>
    </div>
  );
}
