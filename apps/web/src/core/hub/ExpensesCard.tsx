/**
 * Lazy-loaded per-domain card for finyk/expense data in HubReports.
 * Reads its own localStorage shard and aggregates independently.
 */
import { ReportSheet } from "./ReportSheet";
import { useMemo, useState } from "react";
import { messages } from "@shared/i18n/uk";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { DeltaChip } from "@shared/components/ui/DeltaChip";
import { Money } from "@shared/components/ui/Money";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import { readFinykStatsContext } from "@finyk/utils";
import { compareAmounts } from "@sergeant/finyk-domain/domain/selectors";
import { useFinykMonoMirrorTick } from "@finyk/lib/monoMirrorGate";
import { useFinykSqliteReadTick } from "@finyk/lib/sqliteReadGate";
import {
  aggregateSpending,
  reportWindows,
  localDateKey,
  type Period,
  type SpendingInputs,
} from "./hubReports.aggregation";
import { useHubStorageBump } from "./useHubStorageBump";
import {
  formatChartLabel,
  formatChartTooltip,
  labelStep,
} from "./reportChartLabels";

// ── Local sub-components ──────────────────────────────────────────────

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
        {messages.hub.reportNoData}
      </div>
    );
  }

  const step = labelStep(dates.length);
  const formatLabel = (dateStr: string) => formatChartLabel(dateStr, isWeek);
  const formatTooltip = (dateStr: string, value: number) =>
    formatChartTooltip(dateStr, value, unit);

  const selectedDate = selected !== null ? dates[selected] : undefined;
  const selectedVal = selected !== null ? vals[selected] : undefined;

  return (
    <div>
      {selectedDate !== undefined && selectedVal !== undefined ? (
        <div className="text-style-caption text-center text-text mb-1 h-4">
          {formatTooltip(selectedDate, selectedVal)}
        </div>
      ) : (
        <div className="h-4 mb-1" />
      )}
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
          <div
            className="flex items-end gap-0.5 h-20"
            aria-label={messages.hub.reportChartAria}
          >
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

/**
 * Чип зміни витрат до попереднього періоду за правилом Р4 (канон finyk,
 * журнал 2026-09-24): відсоток лише коли попередня сума є базою
 * (`compareAmounts`: ≥ 10 % поточної), інакше абсолютна дельта в гривнях.
 * Без цього «+946 %» проти минулого періоду з однією витратою на 75 ₴
 * читалось як дефект. Агрегат картки — цілі гривні (`calcFinykSpendingByDate`
 * округлює по днях), тож копійки тут `× 100`: точніших значень картка не має.
 */
function SpendingDelta({ cur, prev }: { cur: number; prev: number }) {
  const { pct } = compareAmounts(Math.round(cur * 100), Math.round(prev * 100));
  return (
    <DeltaChip
      cur={cur}
      prev={prev}
      higherIsBetter={false}
      {...(pct === null ? { absoluteUnit: "₴" } : {})}
    />
  );
}

// ── Main card ─────────────────────────────────────────────────────────

interface ExpensesCardProps {
  period: Period;
  offset: number;
}

export default function ExpensesCard({ period, offset }: ExpensesCardProps) {
  const [collapsed, setCollapsed] = useLocalStorageState<boolean>(
    "hub_reports_collapsed_v1:spending",
    true,
    { validate: (v): v is boolean => typeof v === "boolean" },
  );

  // Re-aggregate when any module emits storageUpdated (same-tab) or when
  // the native storage event fires (cross-tab). See useHubStorageBump.ts.
  const bump = useHubStorageBump();
  const mirrorTick = useFinykMonoMirrorTick();
  // CALC-4 (2026-09-01 product audit): `readFinykStatsContext()` reads
  // `getCachedFinykSqliteState()` — a synchronous snapshot of the Finyk
  // SQLite warm cache, refreshed by `refreshCachesAfterPull` once a sync
  // pull lands. That refresh bumps ONLY this tick
  // (`notifyFinykSqliteCacheRefresh` — no `hubBus("storageUpdated")`
  // emit), so on a cold deep-link straight to `/?tab=reports` (nothing
  // else warmed the Finyk cache yet) this card computed its `useMemo`
  // once against an empty cache and never re-ran: `bump`/`mirrorTick`
  // never change for a Finyk-only pull. Reached via SPA nav from
  // `/finyk/*` it looked fine only because that route had already
  // warmed the same module-level cache before this card ever mounted.
  const sqliteCacheTick = useFinykSqliteReadTick();

  const { cur, prev, prevAny, dates, partial } = useMemo(() => {
    void bump; // storage-write tick
    void mirrorTick; // Mono mirror refresh tick
    void sqliteCacheTick; // Finyk SQLite cache-refresh tick (pull hydration)
    // W1-CANON-AGG стадія 2d: картка більше не збирає всесвіт власноруч із
    // самого лише mono-mirror — вона бере той самий канонічний контекст, що
    // й тижневий дайджест і коуч, тож готівкові витрати входять у Звіти.
    // Раніше та сама людина бачила в дайджесті одне число, а в цій картці —
    // менше на суму всього ручного світу.
    const { txs, excludedTxIds, txSplits } = readFinykStatsContext();

    const inputs: SpendingInputs = {
      txList: txs as SpendingInputs["txList"],
      excludedTxIds,
      txSplits: txSplits as Record<string, unknown[]>,
    };

    const w = reportWindows(period, offset);
    return {
      cur: aggregateSpending(inputs, w.cur),
      prev: aggregateSpending(inputs, w.prev),
      prevAny: aggregateSpending(inputs, w.prevAll).total > 0,
      dates: w.dates,
      partial: w.partial,
    };
  }, [period, offset, bump, mirrorTick, sqliteCacheTick]);

  // Нуль в обох вікнах: витрат ще не записували, «0 ₴» тут не результат.
  const empty = cur.total === 0 && !prevAny;

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
          name="credit-card"
          size="lg"
          className="shrink-0 text-finyk"
          aria-hidden
        />
        <SectionHeading
          as="span"
          size="xs"
          className="flex-1 min-w-0 text-muted truncate"
        >
          {messages.finyk.reportHeading}
        </SectionHeading>
        {collapsed && (
          <span className="flex items-baseline gap-2 shrink-0">
            {empty ? (
              <span className="text-style-body font-bold text-text">–</span>
            ) : (
              <>
                <Money
                  amount={cur.total}
                  className="text-style-body font-bold text-text"
                />
                <SpendingDelta cur={cur.total} prev={prev.total} />
              </>
            )}
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
      {!collapsed && empty && (
        <p className="text-style-body text-muted">
          {messages.hub.reportEmptyExpenses}
        </p>
      )}
      {!collapsed && !empty && (
        <>
          <div className="flex items-baseline gap-2">
            <Money
              amount={cur.total}
              className="text-style-headline text-text"
            />
            <SpendingDelta cur={cur.total} prev={prev.total} />
          </div>
          <p className="text-style-caption text-muted">
            {partial
              ? messages.hub.reportPreviousToDate
              : messages.hub.reportPrevious}{" "}
            <Money amount={prev.total} />
          </p>
          <BarChart
            key={`${period}-${offset}`}
            data={cur.daily}
            dates={dates}
            colorClass="bg-chart-finyk"
            unit=" ₴"
          />
        </>
      )}
    </ReportSheet>
  );
}
