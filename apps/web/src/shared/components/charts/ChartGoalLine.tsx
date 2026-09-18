/**
 * ChartGoalLine — #2 goal/threshold reference line for SVG charts
 *
 * Renders a dashed horizontal goal line with a label and optionally a
 * coloured zone fill (above or below the threshold). Used to show budget
 * limits, calorie targets, TDEE, weekly training volume goals, etc.
 *
 * All coordinates are in the SVG viewBox space — callers pass the y pixel
 * value already computed from their data scale.
 *
 * Props:
 *  - `y`          — goal line y-position in viewBox units
 *  - `x1` / `x2` — horizontal extent (usually padL → W-padR)
 *  - `label`      — short text shown to the right of the line (e.g. "Ціль")
 *  - `color`      — CSS color string (e.g. from chartSeries)
 *  - `zone`       — "above" | "below" | "none" — which side to shade
 *  - `zoneBottom` — bottom y of the zone fill (viewBox units, needed for "above")
 *  - `zoneTop`    — top y of the zone fill (needed for "below")
 *  - `gradId`     — unique gradient id (prevent collisions between multiple charts)
 */

interface ChartGoalLineProps {
  y: number;
  x1: number;
  x2: number;
  label?: string;
  color: string;
  zone?: "above" | "below" | "none";
  /** For zone="above": lower boundary of the shaded area (usually padT+innerH). */
  zoneBottom?: number;
  /** For zone="below": upper boundary of the shaded area (usually padT). */
  zoneTop?: number;
  /** Unique id suffix for the gradient def, e.g. "nw" → "nwGoalZone". */
  gradId: string;
}

export function ChartGoalLine({
  y,
  x1,
  x2,
  label,
  color,
  zone = "none",
  zoneBottom,
  zoneTop,
  gradId,
}: ChartGoalLineProps) {
  const fullGradId = `${gradId}GoalZone`;

  return (
    <>
      <defs>
        {zone === "above" && zoneBottom !== undefined && (
          <linearGradient id={fullGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        )}
        {zone === "below" && zoneTop !== undefined && (
          <linearGradient id={fullGradId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.10" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>

      {/* Zone fill */}
      {zone === "above" && zoneBottom !== undefined && (
        <rect
          x={x1}
          y={y}
          width={x2 - x1}
          height={zoneBottom - y}
          fill={`url(#${fullGradId})`}
          className="pointer-events-none"
        />
      )}
      {zone === "below" && zoneTop !== undefined && (
        <rect
          x={x1}
          y={zoneTop}
          width={x2 - x1}
          height={y - zoneTop}
          fill={`url(#${fullGradId})`}
          className="pointer-events-none"
        />
      )}

      {/* Dashed goal line */}
      <line
        x1={x1}
        x2={x2}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth="1.25"
        strokeDasharray="4 3"
        strokeLinecap="round"
        opacity="0.70"
        className="pointer-events-none"
      />

      {/* Label at right edge */}
      {label && (
        <text
          x={x2 + 3}
          y={y + 4}
          fontSize="7"
          fill={color}
          opacity="0.85"
          className="pointer-events-none font-semibold"
        >
          {label}
        </text>
      )}
    </>
  );
}
