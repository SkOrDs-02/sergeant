import { memo } from "react";
import {
  chartAxis,
  chartGrid,
  chartTick,
  statusColors,
} from "@shared/charts/chartTheme";

interface NetworthPoint {
  month: string;
  networth: number;
}

interface NetworthChartProps {
  data?: readonly NetworthPoint[];
}

// SVG-графік нетворсу повністю детермінований вхідним `data`.
// `memo` запобігає перерендеру при незв'язаних оновленнях стану Overview.
function NetworthChartComponent({ data }: NetworthChartProps) {
  if (!data || data.length < 2) return null;

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

  const points = data.map((d, i) => `${px(i)},${py(d.networth)}`).join(" ");
  const areaPoints = [
    `${px(0)},${H - PAD.bottom}`,
    ...data.map((d, i) => `${px(i)},${py(d.networth)}`),
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

  const summaryId = "finyk-networth-summary";

  return (
    <div>
      {/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- chart a11y labels + sr-only summary */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Графік нетворсу за місяці"
        aria-describedby={summaryId}
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
            <circle cx={px(i)} cy={py(d.networth)} r="3" fill={color} />
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
            {/* Value label for first and last */}
            {(i === 0 || i === data.length - 1) && (
              <text
                x={px(i)}
                y={py(d.networth) - 5}
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
      </svg>
      <div id={summaryId} className="sr-only">
        <p>
          Динаміка нетворсу. Поточне значення: {fmt(lastValue)}₴. Зміна від
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
