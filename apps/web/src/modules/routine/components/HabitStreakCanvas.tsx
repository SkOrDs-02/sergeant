/**
 * Last validated: 2026-08-05
 * Status: Active
 *
 * Полотно серії з типами дня (канон §4/§5 — «зробив / не зміг / не
 * зробив», плюс планована пауза й розклад).
 *
 * AI-CONTEXT: раніше єдина поверхня показу серії — «14 🔥» — згортала
 * пʼять різних станів дня в одне число. `flexibleStreakBreakdown` (і
 * тепер її поле `window`, `packages/routine-domain/src/flexStreak.ts`)
 * уже рахує кожен день своєї серії окремо; це полотно припиняє втрату,
 * не рахує нічого нового. Мапінг стан→вигляд рахує кольором акценту лише
 * дні, що стосуються активності самої серії (`done` / `skip` / прощений
 * `miss`) — `pause` і `off` навмисно нейтральні (лінія `line`), бо це дні,
 * яких для серії «не існує» (канон §4).
 *
 * Домен віддає й шостий тип — `pending` (сьогодні заплановано, ще не
 * відмічено). Це НЕ один із пʼяти станів продуктового запиту, але
 * приховати його означало б, що сьогоднішня клітинка на полотні просто
 * зникає — тому тут вона є, окремим тихим (пунктирним) виглядом, без
 * власного пункту в легенді.
 */
import type {
  FlexibleStreakDayCell,
  HabitSkip,
  StreakDayKind,
} from "@sergeant/routine-domain";
import { useMemo } from "react";
import { pluralDays, pluralUa } from "@sergeant/shared";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { flexibleStreakBreakdown } from "../lib/streaks";
import { SKIP_REASON_LABELS } from "../lib/skipReasons";
import type { Habit } from "../lib/types";

const T = messages.routine.streakCanvas;

export interface HabitStreakCanvasProps {
  habit: Habit;
  /** `completions[habit.id]` — масив дат-ключів. */
  completions?: string[] | undefined;
  /** `skips?.[habit.id]` — пропуски саме цієї звички. */
  skips?: Record<string, HabitSkip> | undefined;
  todayKey: string;
  className?: string;
}

const CELL_BASE = "w-6 h-7 shrink-0 rounded-md";

const GRACE_FORMS = { one: "заморозка", few: "заморозки", many: "заморозок" };

function formatCellDate(key: string): string {
  // Парсимо готовий day-key на візуальну мітку — не читаємо годинник
  // хоста, тож "prefer-kyiv-time" тут не застосовний.
  const dt = new Date(`${key}T12:00:00`);
  return dt.toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
}

/** Клітинка полотна — форма/патерн різні для кожного типу, не лише колір. */
function DayCell({
  cell,
  reason,
}: {
  cell: FlexibleStreakDayCell;
  reason: HabitSkip["reason"] | null;
}) {
  const dateLabel = formatCellDate(cell.key);

  switch (cell.kind) {
    case "done":
      return (
        <li
          role="img"
          aria-label={`${dateLabel}: ${T.cellDone}`}
          className={cn(
            CELL_BASE,
            "bg-routine border border-routine-strong/30",
          )}
        />
      );
    case "skip":
      return (
        <li
          role="img"
          aria-label={`${dateLabel}: ${T.cellSkipPrefix}${
            reason ? SKIP_REASON_LABELS[reason] : T.noReason
          }`}
          className={cn(CELL_BASE, "bg-transparent border-2 border-routine/55")}
        />
      );
    case "miss":
      return (
        <li
          role="img"
          aria-label={`${dateLabel}: ${T.cellGrace}`}
          className={cn(
            CELL_BASE,
            "relative overflow-hidden border border-routine-strong/30 bg-panelHi/40",
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1/2 border-t border-routine-strong/40 bg-routine-strong/35"
          />
        </li>
      );
    case "pause":
      return (
        <li
          role="img"
          aria-label={`${dateLabel}: ${T.cellPause}`}
          className={cn(
            CELL_BASE,
            "relative overflow-hidden border border-line/40 bg-panelHi/30",
          )}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 text-line/80"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, currentColor 0, currentColor 2px, transparent 2px, transparent 6px)",
            }}
          />
        </li>
      );
    case "off":
      return (
        <li
          role="img"
          aria-label={`${dateLabel}: ${T.cellOff}`}
          className={cn(CELL_BASE, "bg-line/15")}
        />
      );
    case "pending":
      return (
        <li
          role="img"
          aria-label={`${dateLabel}: ${T.cellPending}`}
          className={cn(CELL_BASE, "border border-dashed border-muted/50")}
        />
      );
    default: {
      // Вичерпний switch по `StreakDayKind` — новий тип дня в домені мав
      // би провалити типізацію тут, а не мовчки випасти з полотна.
      const _exhaustive: never = cell.kind;
      return _exhaustive;
    }
  }
}

interface LegendRow {
  kind: StreakDayKind;
  title: string;
  body: string;
}

const LEGEND: LegendRow[] = [
  { kind: "done", title: T.legendDoneTitle, body: T.legendDoneBody },
  { kind: "skip", title: T.legendSkipTitle, body: T.legendSkipBody },
  { kind: "miss", title: T.legendGraceTitle, body: T.legendGraceBody },
  { kind: "pause", title: T.legendPauseTitle, body: T.legendPauseBody },
  { kind: "off", title: T.legendOffTitle, body: T.legendOffBody },
];

function LegendSwatch({ kind }: { kind: StreakDayKind }) {
  // Ті самі клас-набори, що й у клітинки полотна, розмір фіксований, щоб
  // легенда лишалась вирівняним стовпцем незалежно від тексту праворуч.
  const fixed = "w-6 h-6 shrink-0 rounded-md";
  switch (kind) {
    case "done":
      return (
        <span
          aria-hidden="true"
          className={cn(fixed, "bg-routine border border-routine-strong/30")}
        />
      );
    case "skip":
      return (
        <span
          aria-hidden="true"
          className={cn(fixed, "bg-transparent border-2 border-routine/55")}
        />
      );
    case "miss":
      return (
        <span
          aria-hidden="true"
          className={cn(
            fixed,
            "relative overflow-hidden border border-routine-strong/30 bg-panelHi/40",
          )}
        >
          <span className="absolute inset-x-0 bottom-0 h-1/2 border-t border-routine-strong/40 bg-routine-strong/35" />
        </span>
      );
    case "pause":
      return (
        <span
          aria-hidden="true"
          className={cn(
            fixed,
            "relative overflow-hidden border border-line/40 bg-panelHi/30",
          )}
        >
          <span
            className="absolute inset-0 text-line/80"
            style={{
              backgroundImage:
                "repeating-linear-gradient(-45deg, currentColor 0, currentColor 2px, transparent 2px, transparent 6px)",
            }}
          />
        </span>
      );
    case "off":
    default:
      return <span aria-hidden="true" className={cn(fixed, "bg-line/15")} />;
  }
}

export function HabitStreakCanvas({
  habit,
  completions,
  skips,
  todayKey,
  className,
}: HabitStreakCanvasProps) {
  // `flexibleStreakBreakdown` обходить історію звички день за днем, тож на
  // кожен ререндер полотна це зайвий прохід. `HabitDetailSheet` уже
  // мемоїзує той самий виклик для тієї ж звички — тут те саме.
  const breakdown = useMemo(
    () =>
      flexibleStreakBreakdown(habit, completions, todayKey, {
        skipsForHabit: skips,
      }),
    [habit, completions, todayKey, skips],
  );
  const { window: cells, days, graceUsed } = breakdown;

  const graceLine =
    graceUsed > 0
      ? ` · ${graceUsed} ${pluralUa(graceUsed, GRACE_FORMS)} ${T.graceUsedSuffix}`
      : "";

  return (
    <Card radius="lg" className={className}>
      <SectionHeading as="h3" size="xs" className="mb-1" variant="routine">
        {T.heading}
      </SectionHeading>
      <p className="text-style-caption text-subtle mb-3">
        {days > 0
          ? `${days} ${pluralDays(days)} ${T.daysSuffix}${graceLine}`
          : T.notStarted}
      </p>

      {cells.length === 0 ? (
        <p className="text-style-body text-subtle">{T.emptyHistory}</p>
      ) : (
        <ul
          aria-label={`${T.canvasLabelPrefix} «${habit.name}»`}
          className="flex flex-wrap gap-1 mb-4"
        >
          {cells.map((cell) => (
            <DayCell
              key={cell.key}
              cell={cell}
              reason={skips?.[cell.key]?.reason ?? null}
            />
          ))}
        </ul>
      )}

      <ul className="space-y-2.5">
        {LEGEND.map((row) => (
          <li
            key={row.kind}
            className="grid grid-cols-[24px_1fr] gap-3 items-start"
          >
            <LegendSwatch kind={row.kind} />
            <div>
              <p className="text-style-label text-text font-semibold">
                {row.title}
              </p>
              <p className="text-style-caption text-subtle">{row.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
