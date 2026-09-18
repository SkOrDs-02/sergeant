import { EmptyState } from "@shared/components/ui/EmptyState";
import { chartStatusSeries, linearY, linearSpan } from "@shared/charts";

interface WellbeingPoint {
  label: string;
  energy?: number | null;
  mood?: number | null;
}

interface WellbeingChartProps {
  data: WellbeingPoint[] | null | undefined;
}

/** Grouped bar chart: energy (success green) + mood (info blue) per workout. */
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

  // #1 — var-backed chart tokens (`@shared/charts`) instead of hardcoded
  // rgb() so the bars stay correct in both themes; `chartStatusSeries.*`
  // flips per `.dark`/`html.hc` via `--c-chart-{success,info}` (see
  // `chartTheme.ts`'s theme-blind-SVG-paint warning). No violet token
  // exists in the status set, so "mood" reuses the info (sky-blue) series
  // — still a distinct, theme-reactive hue from energy's green.
  const colorEnergy = chartStatusSeries.success;
  const colorMood = chartStatusSeries.info;
  const summaryId = "fizruk-wellbeing-summary";

  // #5 — show at most 4 evenly-spread x-axis labels once font size grows
  // to the 10px chart-tick floor, mirroring MiniLineChart's thinning so
  // dense series (many workouts) don't overlap.
  const labelIndices = new Set<number>();
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
      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 text-style-caption text-subtle">
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
        aria-describedby={summaryId}
      >
        {/* Horizontal guide lines at 1,2,3,4,5 */}
        {[1, 3, 5].map((score) => {
          const y = linearY(score, 1, MAX_SCORE - 1, padT, innerH);
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
            d.energy != null
              ? linearSpan(d.energy, 1, MAX_SCORE - 1, innerH)
              : 0;
          const moodH =
            d.mood != null ? linearSpan(d.mood, 1, MAX_SCORE - 1, innerH) : 0;
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
              {labelIndices.has(i) && (
                <text
                  x={cx}
                  y={h - 4}
                  textAnchor="middle"
                  fontSize="10"
                  className="fill-muted font-medium"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div id={summaryId} className="sr-only">
        <p>Динаміка енергії та настрою після тренувань.</p>
        <ul>
          {data.map((d, i) => (
            <li key={i}>
              {d.label}
              {d.energy != null ? `, енергія ${d.energy} з 5` : ""}
              {d.mood != null ? `, настрій ${d.mood} з 5` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
