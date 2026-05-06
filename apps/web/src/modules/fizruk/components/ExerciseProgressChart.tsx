import { cn } from "@shared/lib/ui/cn";
import { fmt } from "../lib/numberFmt";

export interface ProgressPoint {
  value: number;
  dateLabel: string;
}

interface ExerciseProgressChartProps {
  points: ProgressPoint[];
  label: string;
  unit: string;
  color: string;
}

export function ExerciseProgressChart({
  points,
  label,
  unit,
  color,
}: ExerciseProgressChartProps) {
  if (!points || points.length < 2) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panelHi/50 py-6 text-center text-xs text-subtle">
        Потрібно щонайменше 2 тренування для графіка
      </div>
    );
  }

  const vals = points.map((p) => p.value);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal - minVal || 1;

  const w = 320;
  const h = 90;
  const padL = 38;
  const padR = 8;
  const padT = 10;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = points.length;
  const step = n > 1 ? innerW / (n - 1) : innerW;

  const mapped = points.map((p, i) => {
    const x = padL + i * step;
    const pct = (p.value - minVal) / range;
    const y = padT + innerH - pct * innerH;
    return { x, y, ...p };
  });

  const lineD = mapped
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaD = `${lineD} L ${mapped[mapped.length - 1]!.x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${mapped[0]!.x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const gradId = `prog_${label.replace(/\s/g, "_")}`;

  const yTicks = [0, 0.5, 1].map((fr) => ({
    y: padT + innerH * (1 - fr),
    lab: (minVal + fr * range).toFixed(0),
  }));

  const labelSet = new Set([0, n - 1]);
  if (n > 3) labelSet.add(Math.floor(n / 2));

  const lastVal = points[points.length - 1]?.value ?? 0;
  const firstVal = points[0]?.value ?? 0;
  const delta = lastVal - firstVal;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[120px] overflow-visible"
        role="img"
        aria-label={`Графік ${label}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
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
              className="text-line/60"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={padL - 4}
              y={t.y + 4}
              textAnchor="end"
              fontSize="9"
              className="fill-subtle"
            >
              {t.lab}
            </text>
          </g>
        ))}
        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={lineD}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {mapped.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={color}
            stroke="white"
            strokeWidth="1.5"
          />
        ))}
        {mapped.map((p, i) => {
          if (!labelSet.has(i)) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={h - 4}
              textAnchor="middle"
              fontSize="8"
              className="fill-muted"
            >
              {p.dateLabel}
            </text>
          );
        })}
      </svg>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-lg font-extrabold tabular-nums text-text">
          {fmt(lastVal, 1)} {unit}
        </span>
        {delta !== 0 && Number.isFinite(delta) && (
          <span
            className={cn(
              "text-xs font-semibold",
              delta > 0 ? "text-success" : "text-warning",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} {unit}
          </span>
        )}
      </div>
    </div>
  );
}
