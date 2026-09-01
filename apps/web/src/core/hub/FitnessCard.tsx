/**
 * Lazy-loaded per-domain card for fizruk/workout data in HubReports.
 * Reads its own localStorage shard and aggregates independently so
 * the Reports page can show this card without blocking on other domains.
 */
import { ReportSheet } from "./ReportSheet";
import { useMemo, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";
import {
  formatChartLabel,
  formatChartTooltip,
  labelStep,
} from "./reportChartLabels";
import {
  aggregateWorkouts,
  getPeriodRange,
  datesInRange,
  localDateKey,
  type Period,
} from "./hubReports.aggregation";
import { useHubStorageBump } from "./useHubStorageBump";
import { useFizrukSqliteReadTick } from "../../modules/fizruk/lib/sqliteReadGate";
import { formatNumberUk } from "@sergeant/shared";

// ── Local sub-components (shared pattern, duplicated per card to keep
//    each card's chunk self-contained — no cross-card coupling) ───────

function BarChart({
  data,
  dates,
  colorClass,
  maxValue,
  unit = "",
}: {
  data: Record<string, number>;
  dates: string[];
  colorClass: string;
  maxValue?: number;
  unit?: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const vals = dates.map((d) => data[d] ?? 0);
  const max = maxValue || Math.max(...vals, 1);
  const hasData = vals.some((v) => v > 0);
  const isWeek = dates.length <= 7;

  if (!hasData) {
    return (
      <div className="h-24 flex items-center justify-center text-style-caption text-muted">
        Немає даних
      </div>
    );
  }

  const step = labelStep(dates.length);
  const formatLabel = (dateStr: string) => formatChartLabel(dateStr, isWeek);
  const formatTooltip = (dateStr: string, value: number) =>
    formatChartTooltip(dateStr, value, unit);

  return (
    <div>
      {selected !== null && (
        <div className="text-style-caption text-center text-text mb-1 h-4">
          {formatTooltip(dates[selected] ?? "", vals[selected] ?? 0)}
        </div>
      )}
      {selected === null && <div className="h-4 mb-1" />}
      <div
        data-testid="report-chart-scroller"
        className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain"
      >
        <div
          className="min-w-full"
          style={{
            width: dates.length > 14 ? `${dates.length * 24}px` : "100%",
          }}
        >
          <div className="flex items-end gap-0.5 h-20" aria-label="Графік">
            {vals.map((v, i) => {
              const pct = Math.max(0, Math.min(100, (v / max) * 100));
              const isToday = dates[i] === localDateKey();
              const isSelected = selected === i;
              return (
                <button
                  key={dates[i]}
                  type="button"
                  data-compact
                  aria-label={formatTooltip(dates[i] ?? "", v)}
                  aria-pressed={isSelected}
                  className="flex-1 flex flex-col items-center justify-end gap-0.5 h-full appearance-none bg-transparent border-0 p-0 cursor-pointer"
                  onClick={() => setSelected(isSelected ? null : i)}
                >
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-[height,background-color,opacity]",
                      "motion-safe:animate-bar-grow",
                      colorClass,
                      (isToday || isSelected) && "opacity-100",
                      !isToday && !isSelected && "opacity-60",
                    )}
                    style={{
                      height: `${pct}%`,
                      minHeight: v > 0 ? "2px" : "0",
                      animationDelay: `${Math.min(i * 30, 600)}ms`,
                    }}
                  />
                </button>
              );
            })}
          </div>
          <div className="flex gap-0.5 mt-1">
            {dates.map((d, i) => {
              const show = i % step === 0 || i === dates.length - 1;
              return (
                <span
                  key={d}
                  className={cn(
                    "flex-1 text-center text-style-caption leading-tight",
                    selected === i ? "text-text font-medium" : "text-muted",
                  )}
                >
                  {show ? formatLabel(d) : ""}
                </span>
              );
            })}
          </div>
        </div>
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

interface FitnessCardProps {
  period: Period;
  offset: number;
}

export default function FitnessCard({ period, offset }: FitnessCardProps) {
  const [collapsed, setCollapsed] = useLocalStorageState<boolean>(
    "hub_reports_collapsed_v1:workouts",
    true,
    { validate: (v): v is boolean => typeof v === "boolean" },
  );

  // Re-aggregate when any module emits storageUpdated (same-tab) or when
  // the native storage event fires (cross-tab). See useHubStorageBump.ts.
  const bump = useHubStorageBump();
  // CALC-4 (аудит 2026-09): на холодному deep-link кеш SQLite модуля
  // наповнюється ПІСЛЯ першого рендера; hub-bump цього не бачить, тік
  // модуля — бачить. Без нього картка лишалась із нулями до наступного
  // запису у сховище (та сама діра, що в ExpensesCard).
  const sqliteTick = useFizrukSqliteReadTick();

  const { cur, prev, dates } = useMemo(() => {
    void bump; // storage-write tick
    void sqliteTick; // module SQLite cache tick (CALC-4) — forces re-read without calling getCached* inside deps
    // Canonical workouts live in the SQLite warm cache — `fizruk_workouts_v1`
    // is tombstoned (drained + deleted on boot). The canonical list carries
    // ISO-string timestamps; `aggregateWorkouts` expects the legacy epoch-ms
    // shape, so adapt before handing it over (a cold cache → null = no data).
    const fizruk = getCachedFizrukSqliteState();
    const rawWorkouts =
      fizruk.refreshedAt === null
        ? null
        : JSON.stringify(
            fizruk.workouts.map((w) => ({
              startedAt: w.startedAt ? Date.parse(w.startedAt) : null,
              endedAt: w.endedAt ? Date.parse(w.endedAt) : null,
            })),
          );
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateWorkouts(rawWorkouts, curDates),
      prev: aggregateWorkouts(rawWorkouts, prevDates),
      dates: curDates,
    };
  }, [period, offset, bump, sqliteTick]);

  const formattedCurrent = formatNumberUk(cur.count);
  const formattedPrev = formatNumberUk(prev.count);

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
          name="dumbbell"
          size="lg"
          className="shrink-0 text-fizruk"
          aria-hidden
        />
        <SectionHeading
          as="span"
          size="xs"
          className="flex-1 min-w-0 text-muted truncate"
        >
          Фізрук (тренування)
        </SectionHeading>
        {collapsed && (
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="text-style-body font-bold text-text">
              {formattedCurrent} трен.
            </span>
            <Delta cur={cur.count} prev={prev.count} higherIsBetter={true} />
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
              {formattedCurrent} трен.
            </span>
            <Delta cur={cur.count} prev={prev.count} higherIsBetter={true} />
          </div>
          <p className="text-style-caption text-muted">
            Минулий: {formattedPrev} трен.
          </p>
          <BarChart
            key={`${period}-${offset}`}
            data={cur.daily}
            dates={dates}
            colorClass="bg-chart-fizruk"
            unit=" трен."
          />
        </>
      )}
    </ReportSheet>
  );
}
