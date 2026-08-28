import { useRef, useMemo } from "react";
import { EmptyState } from "@shared/components/ui/EmptyState";
import {
  seriesExtent,
  pointStep,
  xAt,
  linearY,
  clampToDomain,
  buildLinePath,
  buildAreaPath,
  type ChartPoint,
} from "@shared/charts";
import { useChartScrub } from "@shared/hooks";
import { ChartScrubOverlay, ChartGoalLine } from "@shared/components/charts";
// Один форматер на модуль — інакше «Тіло» друкує «82,5 кг», а «Прогрес»
// «82.5 кг» для того самого зважування (браузерне QA 2026-08-23).
import { fmt, fmtLoose } from "../lib/numberFmt";

export interface MiniLineChartDataPoint {
  value: number | null | undefined;
  label: string;
}

/**
 * Which direction of the footer delta counts as an improvement.
 * Mirrors `TrendDeltaDirection` in `../pages/Body/CollapsibleTrendCard` —
 * kept as an independent local union (rather than a cross-import from
 * `pages/` into `components/`) to avoid an upward module dependency; the
 * two are structurally identical by convention, not by shared type.
 */
export type MiniLineChartDeltaDirection =
  "up-is-good" | "down-is-good" | "neutral";

interface MappedPoint {
  x: number;
  y: number | null;
  v: number | null;
  label: string;
}

interface MiniLineChartProps {
  data: MiniLineChartDataPoint[];
  unit: string;
  color: string;
  metricLabel?: string;
  /**
   * #2 — optional reference/goal value (e.g. target weight, TDEE).
   * Rendered as a dashed goal line with a "Ціль" label.
   */
  goalValue?: number;
  /**
   * Direction of improvement for the footer delta colour.
   * @default "down-is-good" — preserves the chart's original weight-loss-framed
   * colouring for callers that don't pass this prop (e.g. `Progress.tsx`).
   */
  deltaDirection?: MiniLineChartDeltaDirection;
}

/** SVG line chart for measurement trends (weight, body fat %). */
export function MiniLineChart({
  data,
  unit,
  color,
  metricLabel = "показник",
  goalValue,
  deltaDirection = "down-is-good",
}: MiniLineChartProps) {
  const valid = (data || []).filter(
    (d: MiniLineChartDataPoint) =>
      d.value != null && Number.isFinite(Number(d.value)),
  );
  const w = 320;
  const h = 100;
  /**
   * #2 fix — the box must never letterbox internally.
   *
   * `useChartScrub` maps `clientX` → viewBox space with a simple
   * `((clientX - rect.left) / rect.width) * viewBoxWidth` formula, which is
   * only correct when the rendered box's aspect ratio matches the viewBox's
   * (`w`/`h` = 3.2). With just `w-full h-auto max-h-[160px]`, a wide desktop
   * container makes the CSS box wider than its aspect-preserving height, the
   * `height: auto` chain clamps to `max-h` while `width: 100%` stays
   * unconstrained, and the SVG's default `preserveAspectRatio="xMidYMid
   * meet"` then letterboxes the 320×100 content inside that now-mismatched
   * box — shifting every scrub coordinate off by the letterbox margin (the
   * reported "tooltip misses the cursor on desktop" bug). Pairing `max-h`
   * with a `max-w` at the *same* aspect ratio (160 * (320/100) = 512)
   * guarantees the box can never grow wider than its aspect-preserving
   * height allows, so `meet` never has anything to letterbox and the scrub
   * hook's rect-based math stays exact at every viewport width.
   */
  const padL = 40;
  const padR = 8;
  const padT = 10;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = data.length;
  const step = pointStep(innerW, n);
  const svgRef = useRef<SVGSVGElement>(null);
  const xPositions = useMemo(
    () => data.map((_, index) => xAt(padL, index, step)),
    [data, step],
  );
  const { activeIndex, scrubX, bind } = useChartScrub({
    svgRef,
    pointCount: data.length,
    xPositions,
    viewBoxWidth: w,
  });

  if (valid.length === 0) {
    return (
      <EmptyState
        compact
        className="rounded-2xl border border-dashed border-line bg-panelHi/50"
        title="Немає числових даних"
        description={`Додай записи в розділі «Заміри», щоб відстежувати ${metricLabel}.`}
      />
    );
  }
  if (valid.length < 2) {
    return (
      <EmptyState
        compact
        className="rounded-2xl border border-dashed border-line bg-panelHi/50"
        title="Замало точок для лінії"
        description={`Потрібні щонайменше два заміри з ${metricLabel}, щоб побудувати тренд.`}
      />
    );
  }

  const vals = valid.map((d: MiniLineChartDataPoint) => Number(d.value));
  const { min: minVal, max: maxVal, range } = seriesExtent(vals);

  // Map each data point to x,y (null points get x position but no y)
  const points: MappedPoint[] = data.map(
    (d: MiniLineChartDataPoint, i: number) => {
      const x = xAt(padL, i, step);
      if (d.value == null || !Number.isFinite(Number(d.value)))
        return { x, y: null, v: null, label: d.label };
      const y = linearY(Number(d.value), minVal, range, padT, innerH);
      return { x, y, v: Number(d.value), label: d.label };
    },
  );

  // Build line path segments (skip nulls, start new M for each gap)
  const lineSegments: MappedPoint[][] = [];
  let segment: MappedPoint[] = [];
  for (const p of points) {
    if (p.y == null) {
      if (segment.length >= 2) lineSegments.push(segment);
      segment = [];
    } else {
      segment.push(p);
    }
  }
  if (segment.length >= 2) lineSegments.push(segment);

  // Сегменти зібрані лише з не-null точок, тож `y` тут завжди number —
  // каст звужує тип до ChartPoint-сумісного (зайві поля не заважають).
  const asPlotted = (seg: MappedPoint[]): readonly ChartPoint[] =>
    seg as Array<MappedPoint & { y: number }>;
  const lineD = lineSegments
    .map((seg: MappedPoint[]) => buildLinePath(asPlotted(seg)))
    .join(" ");

  // Area fill: use first complete segment
  const mainSeg: MappedPoint[] = lineSegments[0] || [];
  const areaD =
    mainSeg.length >= 2 ? buildAreaPath(asPlotted(mainSeg), padT + innerH) : "";

  const yTicks = [0, 0.5, 1].map((fr) => ({
    y: padT + innerH * (1 - fr),
    lab: formatVal(minVal + fr * range, unit),
  }));

  const lastValid = [...valid].pop() as MiniLineChartDataPoint;
  const firstValid = valid[0] as MiniLineChartDataPoint;
  const delta = Number(lastValid.value) - Number(firstValid.value);
  const deltaClass =
    deltaDirection === "neutral"
      ? "text-subtle"
      : (deltaDirection === "up-is-good") === delta > 0
        ? "text-success-strong dark:text-success"
        : "text-warning-strong dark:text-warning";
  const gradId = `mlcFill${color.replace(/[^a-zA-Z0-9]/g, "")}`;
  const summaryId = `fizruk-mini-line-${metricLabel.replace(/\s/g, "-")}`;

  // Show last few labels (max 4 evenly spread)
  const labelIndices = new Set<number>();
  if (n <= 4) {
    for (let i = 0; i < n; i++) labelIndices.add(i);
  } else {
    labelIndices.add(0);
    labelIndices.add(n - 1);
    labelIndices.add(Math.floor(n / 3));
    labelIndices.add(Math.floor((2 * n) / 3));
  }

  const activePoint = activeIndex !== null ? points[activeIndex] : null;
  const activeDotY = activePoint?.y ?? undefined;
  const activeVal = activePoint?.v;

  // #2 — goal line y-position (clamp to visible range)
  const goalY =
    goalValue !== undefined
      ? linearY(
          clampToDomain(goalValue, minVal, maxVal),
          minVal,
          range,
          padT,
          innerH,
        )
      : undefined;

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[160px] max-w-[512px] mx-auto overflow-visible touch-pan-y cursor-crosshair"
        role="img"
        aria-label={`Графік тренду: ${metricLabel}`}
        aria-describedby={summaryId}
        {...bind}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - padR}
              y1={t.y}
              y2={t.y}
              stroke="currentColor"
              className="text-line/70"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={padL - 4}
              y={t.y + 4}
              textAnchor="end"
              fontSize="10"
              className="fill-subtle font-medium"
            >
              {t.lab}
            </text>
          </g>
        ))}

        {/* #2 — goal line */}
        {goalY !== undefined && (
          <ChartGoalLine
            y={goalY}
            x1={padL}
            x2={w - padR}
            label="Ціль"
            color={color}
            zone="below"
            zoneTop={padT}
            gradId={`mlc${color.replace(/[^a-zA-Z0-9]/g, "")}`}
          />
        )}

        {areaD && <path d={areaD} fill={`url(#${gradId})`} />}
        {lineD && (
          <path
            d={lineD}
            fill="none"
            stroke={color}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {points.map((p: MappedPoint, i: number) => {
          if (p.y == null) return null;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill={color}
              /* #4 — "cut-out" halo uses the surface token, not a static
               * white, so it stays invisible against the dark-theme panel
               * (`--c-panel` = #1b1613) instead of ringing each dot. */
              stroke="rgb(var(--c-panel))"
              strokeWidth="2"
            />
          );
        })}

        {points.map((p: MappedPoint, i: number) => {
          if (!labelIndices.has(i)) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={h - 4}
              textAnchor="middle"
              fontSize="10"
              className="fill-muted font-semibold"
            >
              {p.label}
            </text>
          );
        })}

        {/* #1 — scrub crosshair + tooltip */}
        {activePoint != null &&
          activeDotY !== undefined &&
          activeVal !== null &&
          activeVal !== undefined && (
            <ChartScrubOverlay
              x={scrubX}
              top={padT}
              bottom={padT + innerH}
              dotY={activeDotY}
              dotColor={color}
              label={`${fmt(activeVal, 1)} ${unit}`}
              subLabel={activePoint.label}
              viewBoxWidth={w}
              flipNearEdge={true}
            />
          )}
      </svg>

      <div id={summaryId} className="sr-only">
        <p>
          Тренд {metricLabel}. Поточне значення: {fmtLoose(lastValid.value)}{" "}
          {unit}.
          {delta !== 0
            ? ` Зміна від першого запису: ${delta > 0 ? "+" : ""}${fmt(delta, 1)} ${unit}.`
            : ""}
        </p>
        <ul>
          {valid.map((d, i) => (
            <li key={i}>
              {d.label}: {fmtLoose(d.value)} {unit}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-xl font-extrabold tabular-nums text-text">
          {activeVal !== null && activeVal !== undefined
            ? `${fmt(activeVal, 1)} ${unit}`
            : `${fmtLoose(lastValid.value)} ${unit}`}
        </span>
        {delta !== 0 && activeIndex === null && (
          <span className={`text-style-caption ${deltaClass}`}>
            {delta > 0 ? "+" : ""}
            {fmt(delta, 1)} {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function formatVal(v: number, unit: string): string {
  const n = Number(v) || 0;
  if (unit === "%" || Math.abs(n) < 100) return fmt(n, 1);
  return fmt(Math.round(n));
}
