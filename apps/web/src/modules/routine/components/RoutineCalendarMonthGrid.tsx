import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { ROUTINE_THEME as C } from "../lib/routineConstants";
import { parseDateKey } from "../lib/hubCalendarAggregate";
import type { HubCalendarEvent } from "../lib/types";

type GroupedListItem =
  | { kind: "header"; label: string }
  | { kind: "event"; e: HubCalendarEvent };

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
 * Month-mode block: top nav (‹ / month / ›), "Today" CTA, the 7×N grid
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
            className="border border-line bg-panel/90 shadow-sm"
            onClick={() => goMonth(-1)}
            aria-label="Попередній місяць"
          >
            ‹
          </IconButton>
          <span className="text-style-label capitalize flex-1 text-center">
            {monthTitle}
          </span>
          <IconButton
            size="md"
            variant="ghost"
            className="border border-line bg-panel/90 shadow-sm"
            onClick={() => goMonth(1)}
            aria-label="Наступний місяць"
          >
            ›
          </IconButton>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={goToToday}
          className={cn(
            "w-full rounded-xl text-xs! font-semibold border",
            C.chipOn,
          )}
        >
          Сьогодні
        </Button>
      </div>

      <Card as="section" radius="lg" padding="md">
        <div className="grid grid-cols-7 gap-1 text-center text-2xs font-semibold text-subtle mb-2">
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
            const label = parseDateKey(key).toLocaleDateString("uk-UA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
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
                className={cn(
                  "text-style-label aspect-square min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors",
                  sel
                    ? C.monthSel
                    : "hover:bg-panelHi border border-transparent",
                )}
              >
                <span aria-hidden>{day}</span>
                {n > 0 && (
                  <span className="flex items-center gap-0.5" aria-hidden>
                    <span className={cn("w-1.5 h-1.5 rounded-full", C.dot)} />
                    {n > 1 && (
                      <span className="text-2xs text-subtle tabular-nums">
                        {n}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-subtle mt-3 pt-3 border-t border-line">
          Обрано:{" "}
          {parseDateKey(selectedDay).toLocaleDateString("uk-UA", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        {showFizrukShortcut && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPlanFizruk(selectedDay)}
            className="text-style-caption mt-2 w-full rounded-xl border border-sky-400/30 bg-sky-500/5 hover:bg-sky-500/10 px-3! text-info-strong dark:text-info text-center"
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
                    size="xs"
                    variant="subtle"
                    className={cn(idx > 0 && "mt-2")}
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
                    "flex items-center gap-2 rounded-xl px-3 py-2 border border-line bg-panel/60",
                    e.completed && "opacity-70",
                    e.fizruk &&
                      "cursor-pointer hover:bg-sky-500/5 min-h-[44px]",
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      e.fizruk
                        ? "bg-sky-500"
                        : e.finykSub
                          ? "bg-emerald-500"
                          : C.dot,
                    )}
                  />
                  <span className="text-style-label flex-1 min-w-0 text-text truncate">
                    {e.title}
                  </span>
                  <span className="text-2xs text-subtle shrink-0">
                    {e.subtitle}
                  </span>
                  {e.habitId && (
                    <IconButton
                      size="xs"
                      variant="ghost"
                      onClick={() => onToggleHabit(e.habitId!, e.date)}
                      className={cn(
                        "shrink-0 rounded-xl border text-xs! font-bold",
                        e.completed ? C.done : "border-line text-muted",
                      )}
                      aria-label={
                        e.completed ? "Скасувати виконання" : "Виконано"
                      }
                    >
                      {e.completed ? "✓" : "○"}
                    </IconButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {flatGroupedItems.length === 0 && (
          <p className="mt-2 text-2xs text-subtle text-center">
            Подій на цей день немає
          </p>
        )}
      </Card>
    </>
  );
}
