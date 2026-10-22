/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { ROUTINE_THEME as C } from "../lib/routineConstants";
import { HabitStateButton } from "./HabitStateButton";
import { parseDateKey } from "../lib/hubCalendarAggregate";
import type { HubCalendarEvent } from "../lib/types";
import { Icon } from "@shared/components/ui/Icon";
import { formatUaWeekdayDate } from "@shared/lib/time/uaWeekdayDate";
import { ROUTINE_OUTLINE_ICON_BUTTON } from "./routineIconButton";

type GroupedListItem =
  { kind: "header"; label: string } | { kind: "event"; e: HubCalendarEvent };

export interface RoutineCalendarMonthGridProps {
  monthCursor: { y: number; m: number };
  monthTitle: string;
  cells: ReadonlyArray<number | null>;
  dayCounts: Map<string, number>;
  selectedDay: string;
  goMonth: (delta: number) => void;
  goToToday: () => void;
  onSelectDay: (key: string) => void;
  showFizrukShortcut: boolean;
  onPlanFizruk: (dateKey: string) => void;
  flatGroupedItems: GroupedListItem[];
  onToggleHabit: (habitId: string, dateKey: string) => void;
}

/**
 * Month-mode block: top nav (chevron / month / chevron), "Today" CTA, the 7×N grid
 * of day cells, the selected-day caption, and an inline list of the
 * day's grouped events. Only mounted when `timeMode === "month"`, so
 * the parent controls visibility.
 *
 * Day cells highlight `selectedDay` via `C.monthSel`; non-empty days
 * get a colour dot (and a count badge once `n > 1`). The 7-day weekday
 * header (Пн…Нд) is fixed Ukrainian, ISO-Monday-first to match the
 * routine streak invariants documented in AGENTS.md.
 */
export function RoutineCalendarMonthGrid({
  monthCursor,
  monthTitle,
  cells,
  dayCounts,
  selectedDay,
  goMonth,
  goToToday,
  onSelectDay,
  showFizrukShortcut,
  onPlanFizruk,
  flatGroupedItems,
  onToggleHabit,
}: RoutineCalendarMonthGridProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <IconButton
            size="md"
            variant="ghost"
            className={ROUTINE_OUTLINE_ICON_BUTTON}
            onClick={() => goMonth(-1)}
            aria-label="Попередній місяць"
          >
            <Icon name="chevron-left" size="sm" />
          </IconButton>
          <span className="text-style-label capitalize flex-1 text-center">
            {monthTitle}
          </span>
          <IconButton
            size="md"
            variant="ghost"
            className={ROUTINE_OUTLINE_ICON_BUTTON}
            onClick={() => goMonth(1)}
            aria-label="Наступний місяць"
          >
            <Icon name="chevron-right" size="sm" />
          </IconButton>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToToday}
          className={cn("w-full text-style-label font-semibold", C.chipOn)}
        >
          Сьогодні
        </Button>
      </div>

      <section>
        <div className="grid grid-cols-7 gap-1 text-center text-style-caption font-semibold text-subtle mb-2">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day == null)
              return (
                <div key={`e-${i}`} className="aspect-square min-h-[44px]" />
              );
            const key = `${monthCursor.y}-${String(monthCursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const n = dayCounts.get(key) || 0;
            const sel = selectedDay === key;
            const label = formatUaWeekdayDate(parseDateKey(key), {
              withYear: true,
            });
            const aria =
              n > 0
                ? `${label}, подій: ${n}${sel ? ", обрано" : ""}`
                : `${label}${sel ? ", обрано" : ""}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDay(key)}
                aria-label={aria}
                aria-pressed={sel}
                // data-compact: глобальна сітка 44px на coarse давала клітинці
                // мінімальну ширину 44px, а колонка на 360px має ~38px, і сусідні
                // зони натиску накладались. Висота 44px лишається, ширина = колонка.
                data-compact
                className={cn(
                  "text-style-label aspect-square min-h-[44px] w-full flex flex-col items-center justify-center gap-0.5 transition-colors focus-ring",
                  sel
                    ? C.monthSel
                    : "border-b-2 border-transparent hover:text-text",
                )}
              >
                <span aria-hidden>{day}</span>
                {n > 0 && (
                  <span className="flex items-center gap-0.5" aria-hidden>
                    <span className={cn("w-1.5 h-1.5 rounded-[3px]", C.dot)} />
                    {n > 1 && (
                      <span className="text-style-caption text-subtle tabular-nums">
                        {n}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-style-caption text-subtle mt-3 pt-3 border-t border-line">
          {formatUaWeekdayDate(parseDateKey(selectedDay))}
        </p>
        {showFizrukShortcut && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPlanFizruk(selectedDay)}
            className="text-style-label mt-3 w-full border border-line rounded-lg text-text"
          >
            Планувати тренування
          </Button>
        )}
        {flatGroupedItems.length > 0 && (
          <div className="mt-3 space-y-1">
            {flatGroupedItems.map((item, idx) => {
              if (item.kind === "header") {
                return (
                  <SectionHeading
                    key={`dh-${item.label}`}
                    as="p"
                    size="lg"
                    className={cn("mb-3", idx > 0 && "mt-7")}
                  >
                    {item.label}
                  </SectionHeading>
                );
              }
              const e = item.e;
              return (
                <div
                  key={`dd-${e.id}`}
                  role={e.fizruk ? "button" : undefined}
                  tabIndex={e.fizruk ? 0 : undefined}
                  onClick={() => e.fizruk && onPlanFizruk(e.date)}
                  onKeyDown={(ev) => {
                    if (e.fizruk && (ev.key === "Enter" || ev.key === " ")) {
                      ev.preventDefault();
                      onPlanFizruk(e.date);
                    }
                  }}
                  className={cn(
                    "flex min-h-14 items-center gap-2 border-b border-line py-2",
                    e.fizruk &&
                      "cursor-pointer hover:text-text min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-[3px] shrink-0",
                      C.dot,
                      // Виконане приглушуємо лише на маркері: opacity на всьому
                      // рядку тягнула `text-subtle` підпис нижче AA.
                      e.completed && "opacity-40",
                    )}
                  />
                  <span className="text-style-label flex-1 min-w-0 text-text truncate">
                    {e.title}
                  </span>
                  <span className="text-style-caption text-subtle shrink-0">
                    {e.subtitle}
                  </span>
                  {e.habitId && (
                    <HabitStateButton
                      completed={e.completed === true}
                      onClick={() => {
                        if (e.habitId) onToggleHabit(e.habitId, e.date);
                      }}
                      aria-label={
                        e.completed ? "Скасувати виконання" : "Виконано"
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        {flatGroupedItems.length === 0 && (
          <p className="mt-2 text-style-caption text-subtle text-center">
            Подій на цей день немає
          </p>
        )}
      </section>
    </>
  );
}
