import { EmptyState } from "@shared/components/ui/EmptyState";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Point = any;

/** SVG line chart for measurement trends (weight, body fat %). */
export function MiniLineChart({ data, unit, color, metricLabel = "показник" }) {
  const valid = (data || []).filter(
    (d) => d.value != null && Number.isFinite(Number(d.value)),
  );
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

  const vals = valid.map((d) => Number(d.value));
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  const w = 320;
  const h = 100;
  const padL = 40;
  const padR = 8;
  const padT = 10;
  const padB = 28;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = data.length;
  const step = innerW / (n - 1 || 1);

  // Map each data point to x,y (null points get x position but no y)
  const points = data.map((d, i) => {
    const x = padL + i * step;
    if (d.value == null || !Number.isFinite(Number(d.value)))
      return { x, y: null, v: null, label: d.label };
    const pct = (Number(d.value) - minVal) / range;
    const y = padT + innerH - pct * innerH;
    return { x, y, v: Number(d.value), label: d.label };
  });

  // Build line path segments (skip nulls, start new M for each gap)
  const lineSegments: Point[][] = [];
  let segment: Point[] = [];
  for (const p of points) {
    if (p.y == null) {
      if (segment.length >= 2) lineSegments.push(segment);
      segment = [];
    } else {
      segment.push(p);
    }
  }
  if (segment.length >= 2) lineSegments.push(segment);

  const lineD = lineSegments
    .map((seg) =>
      seg
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
        )
        .join(" "),
    )
    .join(" ");

  // Area fill: use first complete segment
  const mainSeg = lineSegments[0] || [];
  const areaD =
    mainSeg.length >= 2
      ? `${mainSeg.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")} L ${mainSeg[mainSeg.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${mainSeg[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : "";

  const yTicks = [0, 0.5, 1].map((fr) => ({
    y: padT + innerH * (1 - fr),
    lab: formatVal(minVal + fr * range, unit),
  }));

  const lastValid = [...valid].pop();
  const firstValid = valid[0];
  const delta = lastValid.value - firstValid.value;
  const gradId = `mlcFill${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Show last few labels (max 4 evenly spread)
  const labelIndices = new Set();
  if (n <= 4) {
    for (let i = 0; i < n; i++) labelIndices.add(i);
  } else {
    labelIndices.add(0);
    labelIndices.add(n - 1);
    labelIndices.add(Math.floor(n / 3));
    labelIndices.add(Math.floor((2 * n) / 3));
  }

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[160px] overflow-visible"
        role="img"
        aria-label="Графік тренду"
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
              fontSize="9"
              className="fill-subtle font-medium"
            >
              {t.lab}
            </text>
          </g>
        ))}

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

        {points.map((p, i) => {
          if (p.y == null) return null;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill={color}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}

        {points.map((p, i) => {
          if (!labelIndices.has(i)) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={h - 4}
              textAnchor="middle"
              fontSize="9"
              className="fill-muted font-semibold"
            >
              {p.label}
            </text>
          );
        })}
      </svg>

      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-xl font-extrabold tabular-nums text-text">
          {lastValid.value} {unit}
        </span>
        {delta !== 0 && (
          <span
            className={`text-xs font-semibold ${delta > 0 ? "text-warning" : "text-success"}`}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function formatVal(v, unit) {
  const n = Number(v) || 0;
  if (unit === "%" || Math.abs(n) < 100) return n.toFixed(1);
  return String(Math.round(n));
}
