/**
 * Lazy-loaded per-domain card for fizruk/workout data in HubReports.
 * Reads its own localStorage shard and aggregates independently so
 * the Reports page can show this card without blocking on other domains.
 */
import { useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import {
  aggregateWorkouts,
  getPeriodRange,
  datesInRange,
  localDateKey,
  type Period,
} from "./hubReports.aggregation";

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
      <div className="h-24 flex items-center justify-center text-xs text-muted">
        Немає даних
      </div>
    );
  }

  function labelStep(count: number) {
    if (count <= 7) return 1;
    if (count <= 15) return 2;
    return Math.ceil(count / 8);
  }
  const step = labelStep(dates.length);

  function formatLabel(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    if (isWeek) {
      const dayNames = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      return dayNames[d.getDay()];
    }
    return String(d.getDate());
  }

  function formatTooltip(dateStr: string, value: number) {
    const d = new Date(dateStr + "T00:00:00");
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}.${month}: ${value.toLocaleString("uk-UA")}${unit}`;
  }

  return (
    <div>
      {selected !== null && (
        <div className="text-style-caption text-center text-text mb-1 h-4">
          {formatTooltip(dates[selected]!, vals[selected]!)}
        </div>
      )}
      {selected === null && <div className="h-4 mb-1" />}
      <div className="flex items-end gap-0.5 h-20" aria-label="Графік">
        {vals.map((v, i) => {
          const pct = Math.max(0, Math.min(100, (v / max) * 100));
          const isToday = dates[i] === localDateKey();
          const isSelected = selected === i;
          return (
            <button
              key={dates[i]}
              type="button"
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
  );
}

interface DeltaProps {
  cur: number;
  prev: number;
  higherIsBetter?: boolean;
}

function Delta({ cur, prev, higherIsBetter = true }: DeltaProps) {
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return <span className="text-xs text-muted">—</span>;
  const diff = cur - prev;
  const pct = Math.round((diff / prev) * 100);
  const positive = higherIsBetter ? diff >= 0 : diff <= 0;
  const sign = diff >= 0 ? "+" : "";
  const trendingUp = diff >= 0;
  return (
    <span
      className={cn(
        "text-style-caption inline-flex items-center gap-0.5",
        positive ? "text-success" : "text-danger",
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

  const { cur, prev, dates } = useMemo(() => {
    const rawWorkouts = safeReadStringLS("fizruk_workouts_v1");
    const curRange = getPeriodRange(period, offset);
    const prevRange = getPeriodRange(period, offset - 1);
    const curDates = datesInRange(curRange.start, curRange.end);
    const prevDates = datesInRange(prevRange.start, prevRange.end);
    return {
      cur: aggregateWorkouts(rawWorkouts, curDates),
      prev: aggregateWorkouts(rawWorkouts, prevDates),
      dates: curDates,
    };
  }, [period, offset]);

  const formattedCurrent = cur.count.toLocaleString("uk-UA");
  const formattedPrev = prev.count.toLocaleString("uk-UA");

  return (
    <div
      className={cn(
        "bg-panel border border-line rounded-2xl",
        collapsed ? "p-3" : "p-4 space-y-3",
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className={cn(
          "w-full flex items-center gap-2 text-left rounded-xl",
          "-m-1 p-1 hover:bg-panelHi transition-colors",
        )}
      >
        <span className="text-lg shrink-0" aria-hidden>
          🏋️
        </span>
        <SectionHeading
          as="span"
          size="xs"
          className="flex-1 min-w-0 text-muted truncate"
        >
          Фізрук (тренування)
        </SectionHeading>
        {collapsed && (
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="text-base font-bold text-text">
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
            <span className="text-style-hero text-text">
              {formattedCurrent} трен.
            </span>
            <Delta cur={cur.count} prev={prev.count} higherIsBetter={true} />
          </div>
          <p className="text-xs text-muted">Минулий: {formattedPrev} трен.</p>
          <BarChart
            key={`${period}-${offset}`}
            data={cur.daily}
            dates={dates}
            colorClass="bg-chart-fizruk"
            unit=" трен."
          />
        </>
      )}
    </div>
  );
}
