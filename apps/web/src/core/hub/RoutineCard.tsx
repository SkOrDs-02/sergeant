/**
 * Lazy-loaded per-domain card for routine/habits data in HubReports.
 * Reads its own localStorage shard and aggregates independently.
 */
import { ReportSheet } from "./ReportSheet";
import { useMemo } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { loadRoutineState } from "@routine/lib/routineStorage";
import { formatChartTooltip } from "./reportChartLabels";
import {
  aggregateHabits,
  getPeriodRange,
  datesInRange,
  localDateKey,
  type Period,
} from "./hubReports.aggregation";
import { useHubStorageBump } from "./useHubStorageBump";
import { formatNumberUk } from "@sergeant/shared";

// ── Habit consistency heatmap ─────────────────────────────────────────
//
// Календарний heatmap виконання звичок замість стовпчикового графіка:
// для звичок важлива саме консистентність (скільки днів поспіль ти
// «в зеленому»), а не форма тренду. Кожна клітинка — день, інтенсивність
// кольору = % виконання за той день. Тижневий період дає 7 клітинок,
// місячний — повний календарний ряд, і heatmap читається однаково добре
// в обох (на відміну від 30 тонких стовпчиків).
function HabitHeatmap({
  data,
  dates,
}: {
  data: Record<string, number>;
  dates: string[];
}) {
  const vals = dates.map((d) => data[d] ?? 0);
  const hasData = vals.some((v) => v > 0);

  if (!hasData) {
    return (
      <div className="h-24 flex items-center justify-center text-style-caption text-muted">
        {messages.hub.reportNoData}
      </div>
    );
  }

  // 5 щаблів інтенсивності (0 / 1–33 / 34–66 / 67–99 / 100). Пусті дні —
  // тонкий нейтральний слот, щоб календарний ритм лишався видимим.
  function levelClass(pct: number): string {
    if (pct <= 0) return "bg-panelHi border border-line";
    if (pct < 34) return "bg-chart-routine opacity-30";
    if (pct < 67) return "bg-chart-routine opacity-55";
    if (pct < 100) return "bg-chart-routine opacity-80";
    return "bg-chart-routine opacity-100";
  }

  const formatTooltip = (dateStr: string, value: number) =>
    formatChartTooltip(dateStr, value, "%");

  return (
    <div>
      <div
        className="grid grid-cols-7 gap-1"
        role="img"
        aria-label={messages.hub.reportChartAria}
      >
        {dates.map((d, i) => {
          const v = vals[i] ?? 0;
          const isToday = d === localDateKey();
          return (
            <div
              key={d}
              title={formatTooltip(d, v)}
              aria-label={formatTooltip(d, v)}
              className={cn(
                "aspect-square rounded-md transition-[background-color,opacity]",
                "motion-safe:animate-bar-grow",
                levelClass(v),
                isToday && "ring-2 ring-routine/60",
              )}
              style={{ animationDelay: `${Math.min(i * 20, 400)}ms` }}
            />
          );
        })}
      </div>
      {/* Легенда інтенсивності — мовно-нейтральні мітки 0%→100% (i18n-safe,
          без нових рядків у каталозі; шкала кольорів = % виконання за день). */}
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="text-style-caption text-muted tabular-nums">0%</span>
        <span className="flex items-center gap-1" aria-hidden>
          <span className="w-3 h-3 rounded-sm bg-panelHi border border-line" />
          <span className="w-3 h-3 rounded-sm bg-chart-routine opacity-30" />
          <span className="w-3 h-3 rounded-sm bg-chart-routine opacity-55" />
          <span className="w-3 h-3 rounded-sm bg-chart-routine opacity-80" />
          <span className="w-3 h-3 rounded-sm bg-chart-routine opacity-100" />
        </span>
        <span className="text-style-caption text-muted tabular-nums">100%</span>
      </div>
    </div>
  );
}

interface DeltaProps {
  cur: number;
  prev: number;
  higherIsBetter?: boolean;
}

function Delta({ cur, prev, higherIsBetter = true }: DeltaProps) {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0)
    return <span className="text-style-caption text-muted">—</span>;
  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 100);
  const positive = higherIsBetter ? diff >= 0 : diff <= 0;
  const sign = diff >= 0 ? "+" : "";
  const trendingUp = diff >= 0;
  return (
    <span
      className={cn(
        "text-style-caption inline-flex items-center gap-0.5",
        positive
          ? "text-success-strong dark:text-success"
          : "text-danger-strong dark:text-danger",
      )}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="shrink-0"
      >
        {trendingUp ? <path d="M12 5l7 9H5z" /> : <path d="M12 19l-7-9h14z" />}
      </svg>
      {sign}
      {pct}%
    </span>
  );
}

// ── Main card ─────────────────────────────────────────────────────────

interface RoutineCardProps {
  period: Period;
  offset: number;
}

export default function RoutineCard({ period, offset }: RoutineCardProps) {
  const [collapsed, setCollapsed] = useLocalStorageState<boolean>(
    "hub_reports_collapsed_v1:habits",
    true,
    { validate: (v): v is boolean => typeof v === "boolean" },
  );

  // Re-aggregate when any module emits storageUpdated (same-tab) or when
  // the native storage event fires (cross-tab). See useHubStorageBump.ts.
  const bump = useHubStorageBump();

  const { cur, prev, dates } = useMemo(() => {
    void bump; // storage-write tick — forces re-read without calling load* inside deps
    // Canonical routine state from the SQLite warm cache — `hub_routine_v1`
    // is tombstoned (drained + deleted on boot), so a raw LS read is empty.
    //
    // AI-DANGER: передаємо звички ЦІЛКОМ. Раніше тут стояв `.map()`, що
    // зрізав кожну до `{id, archived}` — і саме через це Hub-Reports фізично
    // не міг порахувати знаменник за розкладом: `recurrence` / `weekdays` /
    // `startDate` до агрегатора не доїжджали. Повернення зрізу поверне й
    // старе плоске число (W1-CANON-AGG стадія 4).
    const routine = loadRoutineState();
    const routineState = {
      habits: routine.habits,
      completions: routine.completions,
    };
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    // Заморозка минулого (ADR-0079 §2): картка показує й попередній період,
    // тож без `pausedFrom` пауза, поставлена сьогодні, переписала б обидва
    // числа заднім числом — включно з тим, проти якого рахується дельта.
    // Host-local, як і решта дат цього модуля (`localDateKey`); київська межа
    // доби — окремий борг реєстру метрик (стадія 5г).
    const pausedFrom = localDateKey(new Date());
    return {
      cur: aggregateHabits(routineState, curDates, { pausedFrom }),
      prev: aggregateHabits(routineState, prevDates, { pausedFrom }),
      dates: curDates,
    };
  }, [period, offset, bump]);

  const formattedCurrent = formatNumberUk(cur.pct);
  const formattedPrev = formatNumberUk(prev.pct);

  return (
    <ReportSheet collapsed={collapsed}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={cn(
          "w-full flex items-center gap-2 text-left rounded-xl",
          "-m-1 p-1 hover:bg-panelHi transition-[background-color,transform] active:scale-[0.99]",
        )}
      >
        <Icon
          name="check-circle"
          size="lg"
          className="shrink-0 text-routine"
          aria-hidden
        />
        <SectionHeading
          as="span"
          size="xs"
          className="flex-1 min-w-0 text-muted truncate"
        >
          {messages.routine.reportHeading}
        </SectionHeading>
        {collapsed && (
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="text-style-body font-bold text-text">
              {formattedCurrent}%
            </span>
            <Delta cur={cur.pct} prev={prev.pct} higherIsBetter={true} />
          </span>
        )}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn(
            "shrink-0 text-muted transition-transform",
            collapsed ? "-rotate-90" : "rotate-0",
          )}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {!collapsed && (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-style-headline text-text">
              {formattedCurrent}%
            </span>
            <Delta cur={cur.pct} prev={prev.pct} higherIsBetter={true} />
          </div>
          <p className="text-style-caption text-muted">
            {messages.hub.reportPrevious} {formattedPrev}%
          </p>
          <HabitHeatmap
            key={`${period}-${offset}`}
            data={cur.daily}
            dates={dates}
          />
        </>
      )}
    </ReportSheet>
  );
}
