/**
 * Last validated: 2026-09-03
 * Status: Active
 */
import { useMemo, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { habitScheduledOnDate, monthGrid } from "@sergeant/routine-domain";
import { anchoredTodayDate } from "../lib/dayAnchor";
import { WEEKDAY_LABELS } from "../lib/routineConstants";
import type { Habit } from "../lib/types";

interface MonthCursor {
  y: number;
  m: number;
}

export interface HabitMonthCalendarProps {
  habit: Habit;
  completions: string[];
  todayKey: string;
}

export function HabitMonthCalendar({
  habit,
  completions,
  todayKey,
}: HabitMonthCalendarProps) {
  // Device-local "current month" for the calendar cursor (ADR-0078,
  // cutover 2026-09-01 — consolidated page-audit § Theme 1 — 09 F3) so it
  // matches the user's own calendar, same anchor as `todayKey`.
  const now = anchoredTodayDate();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- див. коментар вище
  const nowYear = now.getFullYear();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- те саме
  const nowMonth = now.getMonth();
  const [calMonth, setCalMonth] = useState<MonthCursor>({
    y: nowYear,
    m: nowMonth,
  });

  const cells = useMemo(
    () => monthGrid(calMonth.y, calMonth.m).cells,
    [calMonth.y, calMonth.m],
  );
  const completionSet = useMemo(() => new Set(completions), [completions]);

  const calMonthTitle = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString(
    "uk-UA",
    {
      month: "long",
      year: "numeric",
    },
  );

  const goCalMonth = (delta: number) => {
    setCalMonth((c) => {
      let m = c.m + delta;
      let y = c.y;
      if (m > 11) {
        m = 0;
        y++;
      }
      if (m < 0) {
        m = 11;
        y--;
      }
      return { y, m };
    });
  };

  return (
    <section className="mb-5" aria-label="Календар виконань">
      <div className="flex items-center justify-between mb-2">
        <SectionHeading as="h3" size="xs" variant="routine">
          Календар
        </SectionHeading>
        <div className="flex items-center gap-2">
          <IconButton
            size="xs"
            variant="ghost"
            onClick={() => goCalMonth(-1)}
            className="rounded-xl border border-line text-muted"
            aria-label="Попередній місяць"
          >
            <Icon name="chevron-left" size="xs" />
          </IconButton>
          <span className="text-style-caption text-text min-w-28 text-center capitalize">
            {calMonthTitle}
          </span>
          <IconButton
            size="xs"
            variant="ghost"
            onClick={() => goCalMonth(1)}
            className="rounded-xl border border-line text-muted"
            aria-label="Наступний місяць"
          >
            <Icon name="chevron-right" size="xs" />
          </IconButton>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((wd) => (
          <div
            key={wd}
            className="text-center text-style-caption text-subtle font-medium pb-1"
          >
            {wd}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;
          const dk = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const scheduled = habitScheduledOnDate(habit, dk);
          const done = completionSet.has(dk);
          const isToday = dk === todayKey;
          return (
            <div
              key={dk}
              className={cn(
                "aspect-square flex items-center justify-center rounded-xl text-style-caption transition-colors",
                done
                  ? "bg-routine-surface2 dark:bg-routine-surface-dark/15 text-routine-strong dark:text-routine border border-routine-ring/40 dark:border-routine-border-dark/30 font-bold"
                  : scheduled
                    ? "bg-panelHi/60 text-muted border border-line/30"
                    : // eslint-disable-next-line sergeant-design/no-opacity-on-text-token -- незапланований день: неактивна клітинка, WCAG 1.4.3 її не покриває (той самий виняток, під яким `HabitDetailSheet.tsx` стоїть в allowlist `eslint.web.js`)
                      "text-subtle/50",
                isToday &&
                  "ring-1 ring-routine-ring/60 dark:ring-routine-border-dark/50",
              )}
              title={
                done ? `${dk}: виконано` : scheduled ? `${dk}: заплановано` : dk
              }
            >
              {day}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-style-caption text-subtle">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-routine-surface2 dark:bg-routine-surface-dark/15 border border-routine-ring/40 dark:border-routine-border-dark/30" />
          Виконано
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-panelHi/60 border border-line/30" />
          Заплановано
        </span>
      </div>
    </section>
  );
}
