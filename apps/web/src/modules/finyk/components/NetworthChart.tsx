import { memo, useRef, useMemo } from "react";
import { chartAxis, chartGrid, chartTick, statusColors } from "@shared/charts";
import { useChartScrub, useTweenedValues } from "@shared/hooks";
import { ChartScrubOverlay } from "@shared/components/charts";
import { ChartGoalLine } from "@shared/components/charts";

interface NetworthPoint {
  month: string;
  networth: number;
}

interface NetworthChartProps {
  data?: readonly NetworthPoint[];
  /**
   * #2 — optional reference line (e.g. savings target, zero-net threshold).
   * Rendered as a dashed goal line with a "Ціль" label.
   */
  goalValue?: number;
}

// SVG-графік нетворсу повністю детермінований вхідним `data`.
// `memo` запобігає перерендеру при незв'язаних оновленнях стану Overview.
function NetworthChartComponent({ data, goalValue }: NetworthChartProps) {
  if (!data || data.length < 2) return null;
  return <NetworthChartInner data={data} goalValue={goalValue} />;
}

// Inner render body: `data` is guaranteed non-empty (length >= 2) here, so
// every hook below runs unconditionally on every render of this component —
// the length guard lives in the wrapper above, satisfying rules-of-hooks
// without an early return interleaved with hook calls.
function NetworthChartInner({
  data,
  goalValue,
}: {
  data: readonly NetworthPoint[];
  goalValue?: number;
}) {
  const values = data.map((d) => d.networth);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const W = 300;
  const H = 80;
  const PAD = { left: 4, right: 4, top: 10, bottom: 20 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const px = (i: number) => PAD.left + (i / (data.length - 1)) * chartW;
  const py = (v: number) => PAD.top + chartH - ((v - min) / range) * chartH;

  // V-18: tween the plotted y-values so the line/area morph smoothly when the
  // series changes (e.g. account filter, new month) instead of snapping. The
  // axis domain (min/max/range) stays anchored to the raw values, so only the
  // curve animates — the scale doesn't jitter mid-tween. Reduced-motion and
  // window-length changes fall back to an instant snap inside the hook.
  const plotValues = useTweenedValues(values);
  const vAt = (i: number) => plotValues[i] ?? data[i]?.networth ?? 0;

  const points = data.map((_, i) => `${px(i)},${py(vAt(i))}`).join(" ");
  const areaPoints = [
    `${px(0)},${H - PAD.bottom}`,
    ...data.map((_, i) => `${px(i)},${py(vAt(i))}`),
    `${px(data.length - 1)},${H - PAD.bottom}`,
  ].join(" ");

  const lastValue = values.at(-1) ?? 0;
  const firstValue = values[0] ?? 0;
  const isPositive = lastValue >= firstValue;
  const color = isPositive ? statusColors.success : statusColors.danger;

  const fmt = (v: number) => {
    if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)}к`;
    return `${Math.round(v)}`;
  };

  const MONTH_UK = [
    "Січ",
    "Лют",
    "Бер",
    "Квіт",
    "Трав",
    "Черв",
    "Лип",
    "Серп",
    "Вер",
    "Жовт",
    "Лист",
    "Груд",
  ];
  const monthLabel = (m: string) => {
    const monthPart = m.split("-")[1];
    const idx = parseInt(monthPart ?? "1", 10) - 1;
    return MONTH_UK[idx] || m;
  };

  // #1 — scrubbing
  const svgRef = useRef<SVGSVGElement>(null);
  const xPositions = useMemo(
    () => data.map((_, i) => px(i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.length, W, PAD.left, PAD.right],
  );

  const { activeIndex, scrubX, bind } = useChartScrub({
    svgRef,
    pointCount: data.length,
    xPositions,
    viewBoxWidth: W,
  });

  const activePoint = activeIndex !== null ? data[activeIndex] : null;
  const activeDotY =
    activeIndex !== null ? py(data[activeIndex]?.networth ?? 0) : undefined;

  // #2 — goal line y-position
  const goalY =
    goalValue !== undefined
      ? py(Math.max(min, Math.min(max, goalValue)))
      : undefined;

  const summaryId = "finyk-networth-summary";

  return (
    <div>
      {/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- chart a11y labels + sr-only summary */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible touch-none cursor-crosshair"
        role="img"
        aria-label="Графік капіталу за місяці"
        aria-describedby={summaryId}
        {...bind}
      >
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Zero line if negative values exist */}
        {min < 0 && max > 0 && (
          <line
            x1={PAD.left}
            y1={py(0)}
            x2={W - PAD.right}
            y2={py(0)}
            className={chartGrid.horizontal.className}
            strokeDasharray={chartGrid.horizontal.strokeDasharray}
            strokeWidth={chartGrid.horizontal.strokeWidth}
          />
        )}

        {/* #2 — goal line */}
        {goalY !== undefined && (
          <ChartGoalLine
            y={goalY}
            x1={PAD.left}
            x2={W - PAD.right}
            label="Ціль"
            color={statusColors.warning}
            zone="above"
            zoneBottom={H - PAD.bottom}
            gradId="nw"
          />
        )}

        {/* Area fill */}
        <polygon points={areaPoints} fill="url(#nwGrad)" />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots + labels */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={px(i)} cy={py(vAt(i))} r="3" fill={color} />
            {/* Month label */}
            <text
              x={px(i)}
              y={H - 4}
              textAnchor={chartTick.textAnchor}
              fontSize="8"
              className={chartTick.className}
            >
              {monthLabel(d.month)}
            </text>
            {/* Value label for first and last (hide when scrubbing to avoid overlap) */}
            {(i === 0 || i === data.length - 1) && activeIndex === null && (
              <text
                x={px(i)}
                y={py(vAt(i)) - 5}
                textAnchor={i === 0 ? "start" : "end"}
                fontSize="8"
                fill={color}
                fontWeight="600"
                className={chartAxis.label.className}
              >
                {fmt(d.networth)}₴
              </text>
            )}
          </g>
        ))}

        {/* #1 — scrub crosshair + tooltip */}
        {activePoint && (
          <ChartScrubOverlay
            x={scrubX}
            top={PAD.top}
            bottom={H - PAD.bottom}
            dotY={activeDotY}
            dotColor={color}
            label={`${fmt(activePoint.networth)}₴`}
            subLabel={monthLabel(activePoint.month)}
            viewBoxWidth={W}
            flipNearEdge={true}
          />
        )}
      </svg>
      <div id={summaryId} className="sr-only">
        <p>
          Динаміка капіталу. Поточне значення: {fmt(lastValue)}₴. Зміна від
          першого місяця: {lastValue - firstValue >= 0 ? "+" : ""}
          {fmt(lastValue - firstValue)}₴.
        </p>
        <ul>
          {data.map((d) => (
            <li key={d.month}>
              {monthLabel(d.month)}: {fmt(d.networth)}₴
            </li>
          ))}
        </ul>
      </div>
      {/* eslint-enable sergeant-design/no-cyrillic-jsx-literal */}
    </div>
  );
}

export const NetworthChart = memo(NetworthChartComponent);
