import { EmptyState } from "@shared/components/ui/EmptyState";

interface WellbeingPoint {
  label: string;
  energy?: number | null;
  mood?: number | null;
}

interface WellbeingChartProps {
  data: WellbeingPoint[] | null | undefined;
}

/** Grouped bar chart: energy (green) + mood (purple) per workout. */
export function WellbeingChart({ data }: WellbeingChartProps) {
  if (!data || data.length === 0) {
    return (
      <EmptyState
        compact
        className="rounded-2xl border border-dashed border-line bg-panelHi/50"
        title="Немає даних для графіка"
        description="Після кількох тренувань з оцінкою енергії та настрою тут зʼявиться діаграма."
      />
    );
  }
  if (data.length < 2) {
    return (
      <EmptyState
        compact
        className="rounded-2xl border border-dashed border-line bg-panelHi/50"
        title="Замало точок"
        description="Потрібно щонайменше два тренування з оцінкою самопочуття, щоб порівняти динаміку."
      />
    );
  }

  const w = 320;
  const h = 90;
  const padL = 8;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const n = data.length;
  const groupW = innerW / n;
  const barW = Math.max(4, Math.min(10, groupW * 0.36));
  const gap = Math.max(2, groupW * 0.06);

  const MAX_SCORE = 5;

  const colorEnergy = "rgb(22 163 74)"; // success green
  const colorMood = "rgb(168 85 247)"; // purple-500

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 text-xs text-subtle">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ background: colorEnergy }}
          />
          Енергія
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ background: colorMood }}
          />
          Настрій
        </span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-auto max-h-[120px] overflow-visible"
        role="img"
        aria-label="Графік самопочуття"
      >
        {/* Horizontal guide lines at 1,2,3,4,5 */}
        {[1, 3, 5].map((score) => {
          const y = padT + innerH - ((score - 1) / (MAX_SCORE - 1)) * innerH;
          return (
            <line
              key={score}
              x1={padL}
              x2={w - padR}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-line/50"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
          );
        })}

        {data.map((d: WellbeingPoint, i: number) => {
          const cx = padL + i * groupW + groupW / 2;
          const energyH =
            d.energy != null ? ((d.energy - 1) / (MAX_SCORE - 1)) * innerH : 0;
          const moodH =
            d.mood != null ? ((d.mood - 1) / (MAX_SCORE - 1)) * innerH : 0;
          const baseY = padT + innerH;

          return (
            <g key={i}>
              {d.energy != null && (
                <rect
                  x={cx - barW - gap / 2}
                  y={baseY - energyH}
                  width={barW}
                  height={Math.max(2, energyH)}
                  rx="2"
                  fill={colorEnergy}
                  fillOpacity="0.85"
                />
              )}
              {d.mood != null && (
                <rect
                  x={cx + gap / 2}
                  y={baseY - moodH}
                  width={barW}
                  height={Math.max(2, moodH)}
                  rx="2"
                  fill={colorMood}
                  fillOpacity="0.85"
                />
              )}
              <text
                x={cx}
                y={h - 4}
                textAnchor="middle"
                fontSize="8"
                className="fill-muted font-medium"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
