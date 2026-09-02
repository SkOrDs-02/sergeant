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
import { buildHabitRangeRows, WEEKDAY_LABELS } from "@sergeant/routine-domain";
import type { HabitRangeCellState } from "@sergeant/routine-domain";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { chartHeatmap } from "@shared/charts";
import { messages } from "@shared/i18n/uk";
import { anchoredTodayDate } from "../lib/dayAnchor";
import { HabitGlyph } from "./HabitGlyph";
import type { Habit, RoutineState } from "../lib/types";

const HEATMAP = chartHeatmap.routine;
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
 */
const CELL_BG: Record<HabitRangeCellState, string> = {
  done: HEATMAP.levels[3],
  skipped: "bg-line/55",
  missed: "bg-line/30",
  unscheduled: "bg-line/10",
};

const CELL_LABEL: Record<HabitRangeCellState, string> = {
  done: M.stateDone,
  skipped: M.stateSkipped,
  missed: M.stateMissed,
  unscheduled: M.stateUnscheduled,
};

const LEGEND: readonly HabitRangeCellState[] = [
  "done",
  "skipped",
  "missed",
  "unscheduled",
];

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
  const rows = useMemo(() => {
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
  }, [habits, completions, skips, days]);

  const habitsById = useMemo(() => {
    const map = new Map<string, Habit>();
    for (const h of habits || []) map.set(h.id, h);
    return map;
  }, [habits]);

  const gridStyle = { gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` };
  const showWeekdayLabels = days <= WEEKDAY_LABEL_MAX_DAYS;
  const firstRowCells = rows[0]?.cells;

  return (
    <Card as="section" radius="lg" aria-label={M.heading}>
      <SectionHeading as="p" size="xs" className="mb-1" variant="routine">
        {M.heading}
      </SectionHeading>
      <p className="mb-3 text-style-caption text-subtle">
        {hint} · {M.todaySuffix}
      </p>

      {rows.length === 0 ? (
        <p className="text-style-body text-subtle">{M.empty}</p>
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
                    <span className="flex min-w-0 items-center gap-1.5 text-style-label text-text">
                      <HabitGlyph value={habit?.emoji} size="sm" />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className="shrink-0 text-style-caption text-subtle tabular-nums">
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
                        title={`${cell.dateKey}: ${CELL_LABEL[cell.state]}`}
                        className={cn(
                          // `max-w-5` + `mx-auto`: колонки — `1fr`, тож на
                          // тижневому зрізі клітинка інакше роздувалась би до
                          // ~44px і рядок ставав стіною блоків (браузерна
                          // перевірка 2026-08-17). Стеля 20px тримає той самий
                          // «дот», що й на 30 днях, і лишає клітинку по центру
                          // своєї колонки — під підписом дня тижня.
                          "aspect-square w-full max-w-5 mx-auto rounded-[2px]",
                          CELL_BG[cell.state],
                          cell.isToday && cn("ring-1", HEATMAP.ring),
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
                    "inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]",
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
