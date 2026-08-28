/**
 * Last validated: 2026-08-08
 * Status: Active — updated with #1 scrub + #2 goal line + `isLoading` skeleton
 */
import { useRef, useMemo } from "react";
import { Measure } from "@shared/components/ui/Measure";
import { cn } from "@shared/lib/ui/cn";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Skeleton } from "@shared/components/ui/Skeleton";
import {
  chartGradients,
  chartGrid,
  chartTick,
  pointStep,
  xAt,
  linearY,
  buildLinePath,
  buildAreaPath,
} from "@shared/charts";
import { useChartScrub } from "@shared/hooks";
import { ChartScrubOverlay, ChartGoalLine } from "@shared/components/charts";
import { formatNumberUk } from "@sergeant/shared";

const LABELS_UK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

// AI-CONTEXT: theme-reactive fizruk chart color — mirrors ProgressRing.tsx's
// `chartVar` map and `chartSeries.fizruk.primary` (chartTheme.ts, now
// var-backed too — design-audit TH1/TH7). The `--c-chart-fizruk` CSS var
// flips per theme (see theme.css); `chartGradients.fizruk` below derives
// from the same var, so the area fill is theme-reactive as well.
const FIZRUK_CHART_COLOR = "rgb(var(--c-chart-fizruk))";

/** Легкий area-chart без залежностей; акцент — module accent (fizruk/cyan). */
interface WeeklyVolumeChartProps {
  volumeKg?: number[];
  className?: string;
  /**
   * #2 — optional weekly volume goal (кг×повт). Rendered as a dashed
   * goal line with a "Ціль" label.
   */
  weeklyGoal?: number;
  /**
   * П1 — while the host page's data source is still warming (e.g. the
   * fizruk SQLite cache on cold boot), `volumeKg` is indistinguishable
   * from "genuinely zero this week". Passing `isLoading` renders a
   * skeleton instead of the "Поки без обʼєму за тиждень" empty-state, so
   * a cold-start render never claims "no volume" before the real answer
   * is known.
   */
  isLoading?: boolean;
}

export function WeeklyVolumeChart({
  volumeKg,
  className,
  weeklyGoal,
  isLoading = false,
}: WeeklyVolumeChartProps) {
  const vals = useMemo(
    () =>
      Array.isArray(volumeKg) && volumeKg.length === 7
        ? volumeKg
        : [0, 0, 0, 0, 0, 0, 0],
    [volumeKg],
  );
  const totalVol = vals.reduce((a, v) => a + (Number(v) || 0), 0);
  const w = 320;
  const h = 120;
  const padL = 36;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = vals.length;
  const step = pointStep(innerW, n);
  const svgRef = useRef<SVGSVGElement>(null);
  const xPositions = useMemo(
    () => vals.map((_, index) => xAt(padL, index, step)),
    [vals, step],
  );
  const { activeIndex, scrubX, bind } = useChartScrub({
    svgRef,
    pointCount: n,
    xPositions,
    viewBoxWidth: w,
  });

  if (isLoading) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-style-caption text-text">Тижневий обʼєм</span>
        </div>
        <Skeleton className="h-[120px] w-full" module="fizruk" />
      </div>
    );
  }

  if (totalVol <= 0) {
    return (
      <div className={cn("w-full", className)}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-style-caption text-text">Тижневий обʼєм</span>
          <span
            className="text-style-caption text-subtle flex items-center gap-1.5"
            aria-hidden
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: FIZRUK_CHART_COLOR }}
            />
            кг×повт
          </span>
        </div>
        <EmptyState
          compact
          className="rounded-2xl border border-dashed border-line bg-panelHi/50"
          title="Поки без обʼєму за тиждень"
          description="Заверши тренування з силовими підходами, тут зʼявиться сумарний обʼєм (кг×повторення) по днях."
        />
      </div>
    );
  }

  const max = Math.max(1, ...vals.map((v) => Number(v) || 0));
  // Домен [0, max] з клемпом лише зверху — нижнього клемпа тут ніколи не
  // було (обʼєм не буває відʼємним), тож зберігаємо формулу дослівно.
  const points = vals.map((v, i) => {
    const x = xAt(padL, i, step);
    const y = linearY(Math.min(Number(v) || 0, max), 0, max, padT, innerH);
    return { x, y, v: Number(v) || 0 };
  });

  const lineD = buildLinePath(points);
  const areaD = buildAreaPath(points, padT + innerH);

  const yTicks = [0, 0.5, 1].map((fr) => ({
    y: padT + innerH * (1 - fr),
    lab: fr === 0 ? "0" : fr === 1 ? formatYAxis(max) : formatYAxis(max * 0.5),
  }));

  // #2 — goal line y-position
  const goalY =
    weeklyGoal !== undefined && weeklyGoal > 0
      ? linearY(Math.min(weeklyGoal, max), 0, max, padT, innerH)
      : undefined;

  const activePoint = activeIndex !== null ? points[activeIndex] : null;
  const activeDotY = activePoint?.y;
  const activeDay = activeIndex !== null ? LABELS_UK[activeIndex] : null;
  const activeVol = activePoint?.v;

  const summaryId = "fizruk-weekly-volume-summary";

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-style-caption text-text">Тижневий обʼєм</span>
        <span
          className="text-style-caption text-subtle flex items-center gap-1.5"
          aria-hidden
        >
          {/* Live scrub label replaces static unit hint */}
          {activeDay !== null && activeVol !== undefined ? (
            <span
              className="tabular-nums font-semibold"
              style={{ color: FIZRUK_CHART_COLOR }}
            >
              {activeDay} · <Measure value={activeVol} unit="кг×повт" />
            </span>
          ) : (
            <>
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: FIZRUK_CHART_COLOR }}
              />
              кг×повт
            </>
          )}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[200px] overflow-visible touch-none cursor-crosshair"
        role="img"
        aria-label="Графік обсягу тренувань за дні поточного тижня"
        aria-describedby={summaryId}
        {...bind}
      >
        <defs>
          <linearGradient id="wvFill" x1="0" y1="0" x2="0" y2="1">
            {chartGradients.fizruk.map((stop, i) => (
              <stop key={i} {...stop} />
            ))}
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - padR}
              y1={t.y}
              y2={t.y}
              className={chartGrid.horizontal.className}
              strokeWidth={chartGrid.horizontal.strokeWidth}
              strokeDasharray={chartGrid.horizontal.strokeDasharray}
            />
            <text
              x={4}
              y={t.y + 4}
              className={cn(chartTick.className, "font-medium")}
            >
              {t.lab}
            </text>
          </g>
        ))}

        {/* #2 — weekly volume goal line */}
        {goalY !== undefined && (
          <ChartGoalLine
            y={goalY}
            x1={padL}
            x2={w - padR}
            label="Ціль"
            color={FIZRUK_CHART_COLOR}
            zone="above"
            zoneBottom={padT + innerH}
            gradId="wv"
          />
        )}

        <path d={areaD} fill="url(#wvFill)" />
        <path
          d={lineD}
          fill="none"
          stroke={FIZRUK_CHART_COLOR}
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={FIZRUK_CHART_COLOR}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        {LABELS_UK.map((lab, i) => {
          const x = xAt(padL, i, step);
          return (
            <text
              key={lab}
              x={x}
              y={h - 6}
              textAnchor="middle"
              className="fill-muted text-style-caption font-semibold"
            >
              {lab}
            </text>
          );
        })}

        {/* #1 — scrub crosshair + tooltip */}
        {activePoint !== null &&
          activeDotY !== undefined &&
          activeVol !== undefined &&
          activeDay !== null && (
            <ChartScrubOverlay
              x={scrubX}
              top={padT}
              bottom={padT + innerH}
              dotY={activeDotY}
              dotColor={FIZRUK_CHART_COLOR}
              label={`${formatYAxis(activeVol)}`}
              subLabel={activeDay}
              viewBoxWidth={w}
              flipNearEdge={true}
            />
          )}
      </svg>
      <div id={summaryId} className="sr-only">
        <p>
          Тижневий обʼєм тренувань. Сума за тиждень: {formatNumberUk(totalVol)}{" "}
          кг×повт.
        </p>
        <ul>
          {LABELS_UK.map((lab, i) => (
            <li key={lab}>
              {lab}: {formatNumberUk(Number(vals[i]) || 0)} кг×повт
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Підпис осі Y. Англійське «2.0k» (і крапка, і латинська «k») стояло
 * посеред україномовного екрана — браузерне QA 2026-08-23. Скорочення
 * українське, роздільник — із єдиного форматера продукту.
 */
function formatYAxis(kg: number) {
  const n = Number(kg) || 0;
  if (n >= 1000) {
    return `${formatNumberUk(n / 1000, { maximumFractionDigits: 1 })} тис.`;
  }
  return formatNumberUk(Math.round(n));
}
