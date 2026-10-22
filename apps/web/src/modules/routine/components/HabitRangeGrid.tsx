import { useDeviceDayKey } from "@shared/hooks/useDeviceDayKey";
/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Per-habit сітка відміток за короткий зріз: один рядок клітинок на кожну
 * звичку, ліворуч давніше — праворуч сьогодні.
 *
 * Доповнює `HabitHeatmap`, не заміняє його. Агрегований хітмап відповідає
 * «наскільки щільний був день узагалі», але не «яка саме звичка провалилась»;
 * цей компонент відповідає на друге питання — і саме тому живе лише на
 * коротких зрізах (7–30 днів), де клітинка ще має видимий розмір. Розподіл
 * зрізів між двома візуалізаціями — у `lib/statsRanges.ts`.
 *
 * Клітинки НЕ інтерактивні навмисно: 8–40px квадрат не може мати 44px
 * touch-target, а робити їх кнопками з `data-compact` (як у хітмапі) тут
 * нема за що — деталі дня вже доступні у стрічці «Огляду». Тому рядок
 * оголошується скрінрідеру одним `role="img"` із підсумком, а клітинки
 * лишаються декоративними.
 */
import { useMemo } from "react";
import {
  buildHabitRangeRows,
  dateKeyInPauseInterval,
  WEEKDAY_LABELS,
} from "@sergeant/routine-domain";
import type { HabitRangeCellState } from "@sergeant/routine-domain";
import { formatDayKeyUk } from "@shared/lib/time/dayKeyLabel";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import { anchoredTodayDate } from "../lib/dayAnchor";
import type { Habit, RoutineState } from "../lib/types";

const M = messages.routine.statsRange;

/**
 * Заливка клітинки за станом: один рожевий (виконано) + впорядкований
 * сірий рамп на три щаблі.
 *
 * AI-CONTEXT: спершу `missed` брав нульовий щабель хітмапної шкали
 * (`HEATMAP.levels[0]`) заради спільної мови двох візуалізацій на одній
 * сторінці. Браузерна перевірка 2026-08-17 це відкинула: у «Чорнилі» той
 * щабель — `bg-line/25`, а `unscheduled` був `/10`, і на клітинці 9×9 px
 * різниця між «пропустив» і «не було в розкладі» зникала — рядок звички,
 * яка в цьому вікні майже не планувалась, читався як порожній баг. Тому
 * тут власний рамп 10 → 30 → 55: кроки зареєстровані, порядок збігається з
 * «тяжкістю» стану, і 9px-клітинка розрізняє всі три.
 *
 * `skipped` навмисно сірий, а не проміжний рожевий щабель: «не зміг» —
 * не часткове виконання (канон §5).
 *
 * У темній `chart-routine` дає rose-400, і десятки клітинок поспіль
 * горіли насиченим рожевим (інвентар v3.1, Д2); там виконане бере
 * приглушений щабель `routine-tint-label`.
 */
type DayState = HabitRangeCellState | "pause";
const CELL_BG: Record<DayState, string> = {
  done: "bg-chart-routine dark:bg-routine-tint-label",
  skipped: "border-2 border-muted bg-transparent",
  pause: "border border-dashed border-muted bg-panel",
  missed: "bg-line/55",
  unscheduled: "border border-line bg-transparent",
};
const CELL_LABEL: Record<DayState, string> = {
  done: M.stateDone,
  skipped: M.stateSkipped,
  pause: M.statePaused,
  missed: M.stateMissed,
  unscheduled: M.stateUnscheduled,
};
const LEGEND: readonly DayState[] = [
  "done",
  "skipped",
  "pause",
  "missed",
  "unscheduled",
];

function displayState(
  cell: { state: HabitRangeCellState; dateKey: string; isToday: boolean },
  habit: Habit | undefined,
): DayState {
  if (cell.state !== "unscheduled" || !habit) return cell.state;
  return dateKeyInPauseInterval(habit.pauseIntervals, cell.dateKey) ||
    (habit.paused && cell.isToday)
    ? "pause"
    : "unscheduled";
}

/** Підписи осі малюємо лише на тижневому зрізі — на 30 колонках вони не влізають. */
const WEEKDAY_LABEL_MAX_DAYS = 7;

export interface HabitRangeGridProps {
  habits: Habit[] | null | undefined;
  completions: RoutineState["completions"] | null | undefined;
  skips?: RoutineState["skips"];
  /** Довжина вікна в днях, включно з сьогодні (`RoutineStatsRange.days`). */
  days: number;
  /** Опис вікна для підзаголовка — «останні 30 днів». */
  hint: string;
}

export function HabitRangeGrid({
  habits,
  completions,
  skips,
  days,
  hint,
}: HabitRangeGridProps) {
  const dayKey = useDeviceDayKey();
  const rows = useMemo(() => {
    void dayKey;
    // Той самий анкер доби, що й у хітмапі та «Зведенні» (`lib/dayAnchor.ts`),
    // не окрема копія — інакше зріз зсувався б на клітинку при роумінгу.
    const today = anchoredTodayDate();
    return buildHabitRangeRows(habits, completions, today, days, {
      // Пара «заморозка минулого + недатований `paused`» — ADR-0079 §3.
      // Вмикається разом із хітмапом, інакше пауза, поставлена сьогодні,
      // вимиває звичку з усього зрізу.
      freezePausedPast: true,
      ...(skips ? { skips } : {}),
    });
  }, [habits, completions, skips, days, dayKey]);

  const habitsById = useMemo(() => {
    const map = new Map<string, Habit>();
    for (const h of habits || []) map.set(h.id, h);
    return map;
  }, [habits]);

  const gridStyle = { gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` };
  const showWeekdayLabels = days <= WEEKDAY_LABEL_MAX_DAYS;
  const firstRowCells = rows[0]?.cells;

  return (
    <Card as="section" aria-label={M.heading}>
      <SectionHeading as="p" size="lg" className="mb-2">
        {M.heading}
      </SectionHeading>
      <p className="mb-3 text-style-caption text-subtle">
        {hint} · {M.todaySuffix}
      </p>

      {rows.length === 0 ? (
        <p className="text-style-body text-subtle">
          {(habits?.length ?? 0) === 0 ? M.emptyNoHabits : M.empty}
        </p>
      ) : (
        <>
          {showWeekdayLabels && firstRowCells && (
            <div
              aria-hidden="true"
              className="mb-1 grid gap-0.5 select-none"
              style={gridStyle}
            >
              {firstRowCells.map((cell) => (
                <span
                  key={cell.dateKey}
                  className="text-center text-style-caption text-subtle"
                >
                  {WEEKDAY_LABELS[cell.weekday] ?? ""}
                </span>
              ))}
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const habit = habitsById.get(row.habitId);
              const name = habit?.name || M.unnamedHabit;
              const summary =
                M.rowSummary
                  .replace("{name}", name)
                  .replace("{done}", String(row.completed))
                  .replace("{total}", String(row.scheduled)) +
                (row.skipped > 0
                  ? M.rowSkippedSuffix.replace("{skipped}", String(row.skipped))
                  : "");
              return (
                <li key={row.habitId} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-style-label-lg font-semibold text-text">
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="shrink-0 text-style-label text-muted tabular-nums">
                      {row.completed}/{row.scheduled} ·{" "}
                      <Measure value={Math.round(row.rate * 100)} unit="%" />
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${summary} · ${hint}`}
                    className="grid gap-0.5"
                    style={gridStyle}
                  >
                    {row.cells.map((cell) => (
                      <span
                        key={cell.dateKey}
                        aria-hidden="true"
                        // Людський підпис, а не сирий день-ключ: у
                        // нативному тултипі стояло «2026-09-01: виконано»
                        // (browser-QA 2026-09-02). `relative: false` — тут
                        // потрібна саме дата: у сітці за 30 днів «сьогодні»
                        // не каже, ПРО ЯКУ клітинку йдеться.
                        title={`${formatDayKeyUk(cell.dateKey, {
                          relative: false,
                        })}: ${CELL_LABEL[displayState(cell, habit)]}`}
                        className={cn(
                          // `max-w-5` + `mx-auto`: колонки — `1fr`, тож на
                          // тижневому зрізі клітинка інакше роздувалась би до
                          // ~44px і рядок ставав стіною блоків (браузерна
                          // перевірка 2026-08-17). Стеля 20px тримає той самий
                          // «дот», що й на 30 днях, і лишає клітинку по центру
                          // своєї колонки — під підписом дня тижня.
                          "aspect-square w-full max-w-5 mx-auto rounded-[3px]",
                          CELL_BG[displayState(cell, habit)],
                          cell.isToday &&
                            "outline outline-1 outline-text outline-offset-2",
                        )}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>

          <div
            role="group"
            aria-label={M.legendLabel}
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-style-caption text-subtle select-none"
          >
            {LEGEND.map((state) => (
              <span key={state} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]",
                    CELL_BG[state],
                  )}
                />
                {CELL_LABEL[state]}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
