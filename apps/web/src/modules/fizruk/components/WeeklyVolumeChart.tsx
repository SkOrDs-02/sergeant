/**
 * Last validated: 2026-07-25
 * Status: Active — updated with #1 scrub + #2 goal line
 */
import { useRef, useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { EmptyState } from "@shared/components/ui/EmptyState";
import {
  chartGradients,
  chartGrid,
  chartSeries,
  chartTick,
} from "@shared/charts";
import { useChartScrub } from "@shared/hooks";
import { ChartScrubOverlay, ChartGoalLine } from "@shared/components/charts";

const LABELS_UK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

/** Легкий area-chart без залежностей; акцент — module accent (fizruk/cyan). */
interface WeeklyVolumeChartProps {
  volumeKg?: number[];
  className?: string;
  /**
   * #2 — optional weekly volume goal (кг×повт). Rendered as a dashed
   * goal line with a "Ціль" label.
   */
  weeklyGoal?: number;
}

export function WeeklyVolumeChart({
  volumeKg,
  className,
  weeklyGoal,
}: WeeklyVolumeChartProps) {
  const vals =
    Array.isArray(volumeKg) && volumeKg.length === 7
      ? volumeKg
      : [0, 0, 0, 0, 0, 0, 0];
  const totalVol = vals.reduce((a, v) => a + (Number(v) || 0), 0);

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
              style={{ backgroundColor: chartSeries.fizruk.primary }}
            />
            кг×повт
          </span>
        </div>
        <EmptyState
          compact
          className="rounded-2xl border border-dashed border-line bg-panelHi/50"
          title="Поки без обʼєму за тиждень"
          description="Заверши тренування з силовими підходами — тут зʼявиться сумарний обʼєм (кг×повторення) по днях."
        />
      </div>
    );
  }

  const max = Math.max(1, ...vals.map((v) => Number(v) || 0));
  const w = 320;
  const h = 120;
  const padL = 36;
  const padR = 8;
  const padT = 12;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = vals.length;
  const step = innerW / (n - 1 || 1);

  const points = vals.map((v, i) => {
    const x = padL + i * step;
    const y = padT + innerH - (Math.min(Number(v) || 0, max) / max) * innerH;
    return { x, y, v: Number(v) || 0 };
  });

  const lineD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const lastPoint = points[n - 1];
  const firstPoint = points[0];
  const areaD =
    lastPoint && firstPoint
      ? `${lineD} L ${lastPoint.x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${firstPoint.x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : lineD;

  const yTicks = [0, 0.5, 1].map((fr) => ({
    y: padT + innerH * (1 - fr),
    lab: fr === 0 ? "0" : fr === 1 ? formatYAxis(max) : formatYAxis(max * 0.5),
  }));

  // #2 — goal line y-position
  const goalY =
    weeklyGoal !== undefined && weeklyGoal > 0
      ? padT + innerH - (Math.min(weeklyGoal, max) / max) * innerH
      : undefined;

  // #1 — scrubbing
  const svgRef = useRef<SVGSVGElement>(null);
  const xPositions = useMemo(
    () => points.map((p) => p.x),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, padL, step],
  );

  const { activeIndex, scrubX, bind } = useChartScrub({
    svgRef,
    pointCount: n,
    xPositions,
    viewBoxWidth: w,
  });

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
            <span className="tabular-nums font-semibold" style={{ color: chartSeries.fizruk.primary }}>
              {activeDay} · {formatYAxis(activeVol)} кг×повт
            </span>
          ) : (
            <>
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: chartSeries.fizruk.primary }}
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
            color={chartSeries.fizruk.primary}
            zone="above"
            zoneBottom={padT + innerH}
            gradId="wv"
          />
        )}

        <path d={areaD} fill="url(#wvFill)" />
        <path
          d={lineD}
          fill="none"
          stroke={chartSeries.fizruk.primary}
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
            fill={chartSeries.fizruk.primary}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        {LABELS_UK.map((lab, i) => {
          const x = padL + i * step;
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
        {activePoint !== null && activeDotY !== undefined && activeVol !== undefined && activeDay !== null && (
          <ChartScrubOverlay
            x={scrubX}
            top={padT}
            bottom={padT + innerH}
            dotY={activeDotY}
            dotColor={chartSeries.fizruk.primary}
            label={`${formatYAxis(activeVol)}`}
            subLabel={activeDay}
            viewBoxWidth={w}
            flipNearEdge={true}
          />
        )}
      </svg>
      <div id={summaryId} className="sr-only">
        <p>
          Тижневий обʼєм тренувань. Сума за тиждень:{" "}
          {totalVol.toLocaleString("uk-UA")} кг×повт.
        </p>
        <ul>
          {LABELS_UK.map((lab, i) => (
            <li key={lab}>
              {lab}: {(Number(vals[i]) || 0).toLocaleString("uk-UA")} кг×повт
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function formatYAxis(kg: number) {
  const n = Number(kg) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
