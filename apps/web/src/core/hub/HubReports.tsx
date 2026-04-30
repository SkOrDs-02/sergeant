import { useState, useMemo } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/cn";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage";
import { generateInsights } from "../lib/insightsEngine";
import {
  getFinykExcludedTxIdsFromStorage,
  getFinykTxSplitsFromStorage,
} from "@finyk/utils";
import {
  aggregateReport,
  getPeriodRange,
  localDateKey,
  type Period,
  type ReportData,
} from "./hubReports.aggregation";

function useReportData(period: Period, offset: number): ReportData {
  return useMemo(
    () =>
      aggregateReport(period, offset, {
        rawFizrukWorkouts: safeReadStringLS("fizruk_workouts_v1"),
        finyk: {
          txList: (() => {
            const raw = safeReadLS("finyk_tx_cache", null) as
              | { txs?: unknown[] }
              | unknown[]
              | null;
            const list = Array.isArray(raw)
              ? raw
              : Array.isArray(raw?.txs)
                ? raw!.txs
                : [];
            return list as Parameters<
              typeof aggregateReport
            >[2]["finyk"]["txList"];
          })(),
          excludedTxIds: getFinykExcludedTxIdsFromStorage(),
          txSplits: getFinykTxSplitsFromStorage() as Record<string, unknown[]>,
        },
        routineState: safeReadLS("hub_routine_v1", null),
        nutritionLog: safeReadLS("nutrition_log_v1", {}),
      }),
    [period, offset],
  );
}

function formatPeriodLabel(period: Period, offset: number): string {
  const { start, end } = getPeriodRange(period, offset);
  if (period === "week") {
    const opts: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    return `${start.toLocaleDateString("uk-UA", opts)} – ${end.toLocaleDateString("uk-UA", opts)}`;
  } else {
    return start.toLocaleDateString("uk-UA", {
      month: "long",
      year: "numeric",
    });
  }
}

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
        <div className="text-xs text-center text-text font-medium mb-1 h-4">
          {formatTooltip(dates[selected], vals[selected])}
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
                  animationDelay: `${i * 30}ms`,
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
                "flex-1 text-center text-[10px] leading-tight",
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
  return (
    <span
      className={cn(
        "text-xs font-medium",
        positive ? "text-success" : "text-danger",
      )}
    >
      {sign}
      {pct}%
    </span>
  );
}

interface StatCardProps {
  title: string;
  icon: string;
  current: number | string;
  prev: number | string;
  unit?: string;
  higherIsBetter?: boolean;
  chart?: React.ReactNode;
  storageKey: string;
}

function StatCard({
  title,
  icon,
  current,
  prev,
  unit,
  higherIsBetter,
  chart,
  storageKey,
}: StatCardProps) {
  const [collapsed, setCollapsed] = useLocalStorageState<boolean>(
    storageKey,
    false,
    { validate: (v): v is boolean => typeof v === "boolean" },
  );
  const formattedCurrent =
    typeof current === "number" ? current.toLocaleString("uk-UA") : current;
  const formattedPrev =
    typeof prev === "number" ? prev.toLocaleString("uk-UA") : prev;

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
          "w-full flex items-center gap-2 text-left rounded-lg",
          "-m-1 p-1 hover:bg-panelHi transition-colors",
        )}
      >
        <span className="text-lg shrink-0" aria-hidden>
          {icon}
        </span>
        <SectionHeading
          as="span"
          size="xs"
          className="flex-1 min-w-0 text-muted truncate"
        >
          {title}
        </SectionHeading>
        {collapsed && (
          <span className="flex items-baseline gap-2 shrink-0">
            <span className="text-base font-bold text-text">
              {formattedCurrent}
              {unit}
            </span>
            <Delta
              cur={typeof current === "number" ? current : 0}
              prev={typeof prev === "number" ? prev : 0}
              higherIsBetter={higherIsBetter}
            />
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
            <span className="text-2xl font-bold text-text">
              {formattedCurrent}
              {unit}
            </span>
            <Delta
              cur={typeof current === "number" ? current : 0}
              prev={typeof prev === "number" ? prev : 0}
              higherIsBetter={higherIsBetter}
            />
          </div>
          {prev !== undefined && (
            <p className="text-xs text-muted">
              Минулий: {formattedPrev}
              {unit}
            </p>
          )}
          {chart}
        </>
      )}
    </div>
  );
}

interface InsightCardProps {
  emoji: string;
  title: string;
  stat: string;
  detail?: string;
}

function InsightCard({ emoji, title, stat, detail }: InsightCardProps) {
  return (
    <div className="bg-panel border border-line rounded-2xl p-4 flex gap-3 items-start">
      <span className="text-2xl shrink-0 leading-none pt-0.5">{emoji}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm text-text leading-snug">{title}</p>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-bold text-brand-strong dark:text-brand">
            {stat}
          </span>
          {detail && (
            <span className="text-xs text-muted truncate">{detail}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function HubReports() {
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState(0);

  const data = useReportData(period, offset);
  const label = formatPeriodLabel(period, offset);
  const isCurrentPeriod = offset === 0;

  const dates = data.period.dates;
  const insights = useMemo(() => generateInsights(), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-xl overflow-hidden border border-line shrink-0">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                setOffset(0);
              }}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                period === p
                  ? "bg-brand-strong text-white"
                  : "text-muted hover:text-text hover:bg-panelHi",
              )}
            >
              {p === "week" ? "Тиждень" : "Місяць"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
            aria-label="Попередній"
          >
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
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-xs text-muted min-w-[90px] text-center">
            {label}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
            disabled={isCurrentPeriod}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors disabled:opacity-30"
            aria-label="Наступний"
          >
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
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <StatCard
          title="Тренування (Фізрук)"
          icon="🏋️"
          storageKey="hub_reports_collapsed_v1:workouts"
          current={data.workouts.cur.count}
          prev={data.workouts.prev.count}
          unit=" трен."
          higherIsBetter={true}
          chart={
            <BarChart
              key={`${period}-${offset}`}
              data={data.workouts.cur.daily}
              dates={dates}
              colorClass="bg-sky-500"
              unit=" трен."
            />
          }
        />

        <StatCard
          title="Витрати (Фінік)"
          icon="💳"
          storageKey="hub_reports_collapsed_v1:spending"
          current={data.spending.cur.total}
          prev={data.spending.prev.total}
          unit=" ₴"
          higherIsBetter={false}
          chart={
            <BarChart
              key={`${period}-${offset}`}
              data={data.spending.cur.daily}
              dates={dates}
              colorClass="bg-emerald-500"
              unit=" ₴"
            />
          }
        />

        <StatCard
          title="Виконання звичок (Рутина)"
          icon="✅"
          storageKey="hub_reports_collapsed_v1:habits"
          current={data.habits.cur.pct}
          prev={data.habits.prev.pct}
          unit="%"
          higherIsBetter={true}
          chart={
            <BarChart
              key={`${period}-${offset}`}
              data={data.habits.cur.daily}
              dates={dates}
              colorClass="bg-orange-500"
              maxValue={100}
              unit="%"
            />
          }
        />

        <StatCard
          title="Середньо ккал/день (Харчування)"
          icon="🥗"
          storageKey="hub_reports_collapsed_v1:kcal"
          current={data.kcal.cur.avg}
          prev={data.kcal.prev.avg}
          unit=" ккал"
          higherIsBetter={true}
          chart={
            <BarChart
              key={`${period}-${offset}`}
              data={data.kcal.cur.daily}
              dates={dates}
              colorClass="bg-lime-500"
              unit=" ккал"
            />
          }
        />
      </div>

      {insights.length >= 2 ? (
        <div className="space-y-3">
          <SectionHeading as="p" size="sm">
            Інсайти
          </SectionHeading>
          {insights.map((ins) => (
            <InsightCard key={ins.id} {...ins} />
          ))}
        </div>
      ) : (
        <div className="bg-panel border border-line rounded-2xl p-4 text-center text-xs text-muted">
          Збери більше даних для інсайтів
        </div>
      )}

      <div className="bg-panel border border-line rounded-2xl p-4">
        <SectionHeading as="p" size="xs" className="mb-3">
          Підсумок
        </SectionHeading>
        <div className="space-y-2 text-sm text-text">
          {data.workouts.cur.count > 0 && (
            <p>
              🏋️ Ви тренувались <strong>{data.workouts.cur.count}</strong>{" "}
              {data.workouts.cur.count === 1
                ? "раз"
                : data.workouts.cur.count < 5
                  ? "рази"
                  : "разів"}
            </p>
          )}
          {data.spending.cur.total > 0 && (
            <p>
              💳 Витрачено{" "}
              <strong>
                {data.spending.cur.total.toLocaleString("uk-UA")} ₴
              </strong>
            </p>
          )}
          {data.habits.cur.pct > 0 && (
            <p>
              ✅ Звички виконано на <strong>{data.habits.cur.pct}%</strong>
            </p>
          )}
          {data.kcal.cur.avg > 0 && (
            <p>
              🥗 Середньо{" "}
              <strong>
                {data.kcal.cur.avg.toLocaleString("uk-UA")} ккал/день
              </strong>
            </p>
          )}
          {data.workouts.cur.count === 0 &&
            data.spending.cur.total === 0 &&
            data.habits.cur.pct === 0 &&
            data.kcal.cur.avg === 0 && (
              <p className="text-muted text-center py-2">
                Немає даних за цей період
              </p>
            )}
        </div>
      </div>
    </div>
  );
}
