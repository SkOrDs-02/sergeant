import { useMemo, useState } from "react";
import { cn } from "@shared/lib/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import {
  dateKeyFromDate,
  parseDateKey,
  habitScheduledOnDate,
} from "../lib/hubCalendarAggregate";
import { completionNoteKey } from "../lib/completionNoteKey";
import { streakForHabit, maxStreakAllTime } from "../lib/streaks";
import {
  ROUTINE_THEME as C,
  RECURRENCE_OPTIONS,
  WEEKDAY_LABELS,
} from "../lib/routineConstants";
import type { Habit, RoutineState } from "../lib/types";

function todayKey(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return dateKeyFromDate(d);
}

function monthGrid(y: number, m: number): Array<number | null> {
  const last = new Date(y, m + 1, 0).getDate();
  const firstWd = (new Date(y, m, 1).getDay() + 6) % 7;
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWd; i++) cells.push(null);
  for (let d = 1; d <= last; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function completionPct(
  habit: Habit,
  completions: string[],
  days: number,
): number | null {
  const tk = todayKey();
  let scheduled = 0;
  let done = 0;
  const set = new Set(completions || []);
  for (let i = 0; i < days; i++) {
    const d = parseDateKey(tk);
    d.setDate(d.getDate() - i);
    d.setHours(12, 0, 0, 0);
    const key = dateKeyFromDate(d);
    if (!habitScheduledOnDate(habit, key)) continue;
    scheduled++;
    if (set.has(key)) done++;
  }
  if (scheduled === 0) return null;
  return Math.round((done / scheduled) * 100);
}

export interface HabitDetailSheetProps {
  habitId: string;
  routine: RoutineState;
  onClose: () => void;
}

interface MonthCursor {
  y: number;
  m: number;
}

interface NoteEntry {
  date: string;
  text: string;
}

export function HabitDetailSheet({
  habitId,
  routine,
  onClose,
}: HabitDetailSheetProps) {
  const habit = routine.habits.find((h) => h.id === habitId);
  const completions = useMemo(
    () => routine.completions[habitId] || [],
    [routine.completions, habitId],
  );
  const tk = todayKey();

  const now = new Date();
  const [calMonth, setCalMonth] = useState<MonthCursor>({
    y: now.getFullYear(),
    m: now.getMonth(),
  });

  const tag = useMemo<string[]>(() => {
    if (!habit) return [];
    const ids = habit.tagIds || [];
    return ids
      .map((id) => routine.tags.find((t) => t.id === id)?.name)
      .filter((n): n is string => Boolean(n));
  }, [habit, routine.tags]);

  const category = useMemo(() => {
    if (!habit?.categoryId) return null;
    return (
      routine.categories.find((c) => c.id === habit.categoryId)?.name || null
    );
  }, [habit, routine.categories]);

  const recLabel = habit
    ? RECURRENCE_OPTIONS.find((o) => o.value === (habit.recurrence || "daily"))
        ?.label || ""
    : "";

  const currentStreak = useMemo(
    () => (habit ? streakForHabit(habit, completions, tk) : 0),
    [habit, completions, tk],
  );
  const bestStreak = useMemo(
    () => (habit ? maxStreakAllTime(habit, completions) : 0),
    [habit, completions],
  );
  const totalDone = completions.length;

  const pct7 = useMemo(
    () => (habit ? completionPct(habit, completions, 7) : null),
    [habit, completions],
  );
  const pct30 = useMemo(
    () => (habit ? completionPct(habit, completions, 30) : null),
    [habit, completions],
  );
  const pct90 = useMemo(
    () => (habit ? completionPct(habit, completions, 90) : null),
    [habit, completions],
  );

  const cells = useMemo(
    () => monthGrid(calMonth.y, calMonth.m),
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

  const notes = useMemo<NoteEntry[]>(() => {
    const notesObj = routine.completionNotes || {};
    const items: NoteEntry[] = [];
    const sorted = [...completions].sort().reverse();
    for (const dk of sorted) {
      const k = completionNoteKey(habitId, dk);
      if (notesObj[k]) {
        items.push({ date: dk, text: notesObj[k] });
      }
      if (items.length >= 10) break;
    }
    return items;
  }, [completions, routine.completionNotes, habitId]);

  if (!habit) return null;

  const chips =
    tag.length > 0 || category ? (
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {tag.map((t) => (
          <span
            key={t}
            className="text-2xs px-2 py-0.5 rounded-full bg-routine-surface dark:bg-routine-surface-dark/10 border border-routine-line/50 dark:border-routine-border-dark/25 text-routine-strong dark:text-routine font-medium"
          >
            {t}
          </span>
        ))}
        {category && (
          <span className="text-2xs px-2 py-0.5 rounded-full bg-panelHi border border-line text-muted font-medium">
            {category}
          </span>
        )}
      </div>
    ) : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span>
          {habit.emoji} {habit.name}
        </span>
      }
      description={chips}
      panelClassName="routine-sheet max-w-4xl"
      zIndex={200}
    >
      <div className="text-xs text-subtle space-y-0.5 mb-5">
        <p>
          {recLabel}
          {habit.timeOfDay ? ` · ${habit.timeOfDay}` : ""}
        </p>
        <p>
          {habit.startDate ? `з ${habit.startDate}` : ""}
          {habit.endDate ? ` до ${habit.endDate}` : ""}
          {!habit.startDate && !habit.endDate ? "Без обмежень дат" : ""}
        </p>
        {habit.recurrence === "weekly" &&
          habit.weekdays &&
          habit.weekdays.length > 0 && (
            <p>{habit.weekdays.map((i) => WEEKDAY_LABELS[i]).join(", ")}</p>
          )}
      </div>

      <section className="mb-5" aria-label="Статистика">
        <SectionHeading as="h3" size="sm" className="mb-2">
          Статистика
        </SectionHeading>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className={C.statCard}>
            <p className="text-2xl font-black text-text tabular-nums">
              {currentStreak}
            </p>
            <p className="text-2xs text-subtle mt-0.5">Поточна серія</p>
          </div>
          <div className={C.statCard}>
            <p className="text-2xl font-black text-text tabular-nums">
              {bestStreak}
            </p>
            <p className="text-2xs text-subtle mt-0.5">Макс серія</p>
          </div>
          <div className={C.statCard}>
            <p className="text-2xl font-black text-text tabular-nums">
              {totalDone}
            </p>
            <p className="text-2xs text-subtle mt-0.5">Разів виконано</p>
          </div>
          <div className={C.statCard}>
            <div className="flex items-baseline justify-center gap-1.5">
              {pct7 !== null && (
                <span className="text-sm font-bold text-text tabular-nums">
                  {pct7}%
                </span>
              )}
              {pct30 !== null && (
                <span className="text-xs text-muted tabular-nums">
                  {pct30}%
                </span>
              )}
              {pct90 !== null && (
                <span className="text-2xs text-subtle tabular-nums">
                  {pct90}%
                </span>
              )}
              {pct7 === null && pct30 === null && pct90 === null && (
                <span className="text-sm text-muted">—</span>
              )}
            </div>
            <p className="text-2xs text-subtle mt-0.5">% за 7 / 30 / 90 д</p>
          </div>
        </div>
      </section>

      <section className="mb-5" aria-label="Календар виконань">
        <div className="flex items-center justify-between mb-2">
          <SectionHeading as="h3" size="sm">
            Календар
          </SectionHeading>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goCalMonth(-1)}
              className="w-8 h-8 rounded-xl border border-line text-muted hover:text-text flex items-center justify-center text-sm"
              aria-label="Попередній місяць"
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-text min-w-[7rem] text-center capitalize">
              {calMonthTitle}
            </span>
            <button
              type="button"
              onClick={() => goCalMonth(1)}
              className="w-8 h-8 rounded-xl border border-line text-muted hover:text-text flex items-center justify-center text-sm"
              aria-label="Наступний місяць"
            >
              ›
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((wd) => (
            <div
              key={wd}
              className="text-center text-2xs text-subtle font-medium pb-1"
            >
              {wd}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />;
            const dk = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const scheduled = habitScheduledOnDate(habit, dk);
            const done = completionSet.has(dk);
            const isToday = dk === tk;
            return (
              <div
                key={dk}
                className={cn(
                  "aspect-square flex items-center justify-center rounded-xl text-xs font-medium transition-colors",
                  done
                    ? "bg-routine-surface2 dark:bg-routine-surface-dark/15 text-routine-strong dark:text-routine border border-routine-ring/40 dark:border-routine-border-dark/30 font-bold"
                    : scheduled
                      ? "bg-panelHi/60 text-muted border border-line/30"
                      : "text-subtle/50",
                  isToday &&
                    "ring-1 ring-routine-ring/60 dark:ring-routine-border-dark/50",
                )}
                title={
                  done
                    ? `${dk}: виконано`
                    : scheduled
                      ? `${dk}: заплановано`
                      : dk
                }
              >
                {day}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2 text-2xs text-subtle">
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

      {notes.length > 0 && (
        <section className="mb-2" aria-label="Нотатки">
          <SectionHeading as="h3" size="sm" className="mb-2">
            Останні нотатки
          </SectionHeading>
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li
                key={n.date}
                className="text-[12px] bg-panelHi/50 border border-line/40 rounded-xl px-3 py-2"
              >
                <span className="text-subtle">{n.date}:</span>{" "}
                <span className="text-text">{n.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  );
}
