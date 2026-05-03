import { memo, useState } from "react";
import { chartHex } from "@sergeant/design-tokens/tokens";
import { cn } from "@shared/lib/ui/cn";

// Convert a polar angle (0° = 12 o'clock, clockwise) to cartesian coordinates.
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Trim SVG path coordinates to 2 decimals. For a 160×160 viewBox this is
// well below sub-pixel precision and keeps the inlined <path d="…"> data
// compact (AGENTS.md §6.4).
const f2 = (v: number) => v.toFixed(2);

// Build a closed donut-sector path: outer arc (CW) + line to inner +
// inner arc (CCW) + close. Using filled sectors avoids stroke-linecap
// artifacts that make thick stroked arcs look polygonal at segment
// boundaries.
function describeSector(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
) {
  const sweep = endDeg - startDeg;
  // Full ring: draw as two concentric circles via two half-sweeps so the
  // path is valid even when sweep === 360°.
  if (sweep >= 360) {
    const midDeg = startDeg + 180;
    const o1 = polarToXY(cx, cy, outerR, startDeg);
    const o2 = polarToXY(cx, cy, outerR, midDeg);
    const i1 = polarToXY(cx, cy, innerR, startDeg);
    const i2 = polarToXY(cx, cy, innerR, midDeg);
    return [
      `M ${f2(o1.x)} ${f2(o1.y)}`,
      `A ${outerR} ${outerR} 0 0 1 ${f2(o2.x)} ${f2(o2.y)}`,
      `A ${outerR} ${outerR} 0 0 1 ${f2(o1.x)} ${f2(o1.y)}`,
      `M ${f2(i1.x)} ${f2(i1.y)}`,
      `A ${innerR} ${innerR} 0 0 0 ${f2(i2.x)} ${f2(i2.y)}`,
      `A ${innerR} ${innerR} 0 0 0 ${f2(i1.x)} ${f2(i1.y)}`,
      "Z",
    ].join(" ");
  }
  const largeArc = sweep > 180 ? 1 : 0;
  const outerStart = polarToXY(cx, cy, outerR, startDeg);
  const outerEnd = polarToXY(cx, cy, outerR, endDeg);
  const innerEnd = polarToXY(cx, cy, innerR, endDeg);
  const innerStart = polarToXY(cx, cy, innerR, startDeg);
  return [
    `M ${f2(outerStart.x)} ${f2(outerStart.y)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${f2(outerEnd.x)} ${f2(outerEnd.y)}`,
    `L ${f2(innerEnd.x)} ${f2(innerEnd.y)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${f2(innerStart.x)} ${f2(innerStart.y)}`,
    "Z",
  ].join(" ");
}

const TOP_N = 5;

// Presentational donut chart for category spending. Output is fully
// derived from props + local expand/collapse state, so `memo` skips
// redundant re-renders when the parent Analytics page re-renders for
// unrelated reasons.
interface CategorySlice {
  categoryId: string;
  label: string;
  spent: number;
  color: string;
}

interface CategoryPieChartProps {
  data?: CategorySlice[];
  size?: number;
  className?: string;
}

function CategoryPieChartComponent({
  data = [],
  size = 160,
  className,
}: CategoryPieChartProps) {
  const [showAll, setShowAll] = useState(false);
  const hasOverflow = (data?.length ?? 0) > TOP_N;

  if (!data || data.length === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  // Pad by 1px so the filled sector never touches the viewBox edge.
  const outerR = size / 2 - 1;
  const innerR = outerR * 0.62;

  const total = data.reduce((s, d) => s + d.spent, 0);
  if (total === 0) return null;

  const expanded = showAll && hasOverflow;
  let segments;
  if (expanded) {
    // Expanded view shows every category returned by the selector
    // (capped at 20 in `selectCategoryDistributionFromIndex`). Collapsed
    // view keeps the top N + "Інше" bucket.
    segments = data;
  } else {
    const top = data.slice(0, TOP_N);
    const otherSpent = data.slice(TOP_N).reduce((s, d) => s + d.spent, 0);
    segments =
      otherSpent > 0
        ? [
            ...top,
            {
              categoryId: "_other",
              label: "Інше",
              spent: otherSpent,
              color: chartHex.neutral,
            },
          ]
        : top;
  }

  let currentAngle = 0;
  const arcs = segments.map((seg) => {
    const pct = seg.spent / total;
    const sweep = pct * 360;
    const start = currentAngle;
    currentAngle += sweep;
    return { ...seg, start, end: currentAngle, pct };
  });

  // Gap between segments, in degrees. Only applied when there are 2+
  // rendered slices; a single full-ring slice has no neighbours to separate.
  // Threshold matches the render skip below (`sweep < 0.5`) so we never add
  // padding for a neighbour that won't actually be drawn.
  const RENDER_MIN_SWEEP = 0.5;
  const visible = arcs.filter((a) => a.end - a.start >= RENDER_MIN_SWEEP);
  const GAP_DEG = visible.length > 1 ? 1 : 0;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="shrink-0"
          role="img"
          aria-label="Кругова діаграма категорій"
        >
          {arcs.map((arc, i) => {
            const sweep = arc.end - arc.start;
            if (sweep < RENDER_MIN_SWEEP) return null;
            // Shrink each sector symmetrically so neighbouring slices
            // get a clean radial gap. Never let a slice collapse.
            const pad = Math.min(GAP_DEG / 2, sweep / 2 - 0.01);
            const start = arc.start + pad;
            const end = arc.end - pad;
            const d = describeSector(cx, cy, outerR, innerR, start, end);
            return (
              <path
                key={arc.categoryId || i}
                d={d}
                fill={arc.color}
                stroke="none"
              />
            );
          })}
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fontSize="11"
            className="fill-muted font-medium"
          >
            Всього
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            className="fill-text"
          >
            {total.toLocaleString("uk-UA")} ₴
          </text>
        </svg>

        <div className="flex-1 w-full space-y-1.5 min-w-0">
          {arcs.map((arc) => (
            <div
              key={arc.categoryId}
              className="flex items-center gap-2 text-sm"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: arc.color }}
              />
              <span className="text-text truncate flex-1 min-w-0 text-xs">
                {arc.label}
              </span>
              {(() => {
                // `arc.pct` is the fraction of `total` (0..1), not a
                // percentage. Round to the integer percentage first, then
                // keep the "<1" hint for segments that round to zero but
                // are still > 0.
                const pctInt = Math.round(arc.pct * 100);
                return (
                  <span className="text-muted tabular-nums text-xs shrink-0">
                    {pctInt < 1 ? "<1" : pctInt}%
                  </span>
                );
              })()}
              <span className="text-text tabular-nums text-style-caption shrink-0">
                {arc.spent.toLocaleString("uk-UA")} ₴
              </span>
            </div>
          ))}
        </div>
      </div>
      {hasOverflow ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={expanded}
            data-testid="finyk-analytics-donut-toggle"
            className="px-3 py-1.5 rounded-full border border-line bg-panelHi text-style-caption text-text hover:border-muted/50 transition-colors"
          >
            {expanded ? "Згорнути ↑" : `Показати всі (${data.length}) ↓`}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export const CategoryPieChart = memo(CategoryPieChartComponent);
