/**
 * ChartScrubOverlay — #1 crosshair + tooltip for SVG charts
 *
 * Renders a vertical crosshair line and a tooltip bubble at the active scrub
 * position.  Placed as a child of the chart <svg> so it inherits the viewBox
 * coordinate system.
 *
 * Props:
 *  - `x`          — crosshair x (viewBox units)
 *  - `top` / `bottom` — vertical extent of the crosshair
 *  - `dotY`       — y-coord of the data-point dot
 *  - `dotColor`   — CSS color string for the dot
 *  - `label`      — primary tooltip text
 *  - `subLabel`   — secondary tooltip text (optional)
 *  - `viewBoxWidth` — total SVG width, used to flip tooltip near right edge
 *
 * The component is fully declarative — pass undefined `x` to hide everything.
 */

interface ChartScrubOverlayProps {
  x: number | undefined;
  top: number;
  bottom: number;
  dotY: number | undefined;
  dotColor: string;
  label: string;
  /** Pass undefined to omit the sub-line entirely (use `undefined`, not absent). */
  subLabel: string | undefined;
  viewBoxWidth: number;
  /** If true, flip tooltip to the left side when near right edge. */
  flipNearEdge: boolean;
}

const TOOLTIP_W = 70;
const TOOLTIP_H = 28;
const TOOLTIP_EDGE_MARGIN = 8;

export function ChartScrubOverlay({
  x,
  top,
  bottom,
  dotY,
  dotColor,
  label,
  subLabel,
  viewBoxWidth,
  flipNearEdge,
}: ChartScrubOverlayProps) {
  if (x === undefined) return null;

  // Flip tooltip when too close to right edge
  const flipLeft =
    flipNearEdge && x + TOOLTIP_W / 2 + TOOLTIP_EDGE_MARGIN > viewBoxWidth;
  const flipRight = x - TOOLTIP_W / 2 - TOOLTIP_EDGE_MARGIN < 0;
  const tooltipX = flipLeft
    ? x - TOOLTIP_W - 6
    : flipRight
      ? x + 6
      : x - TOOLTIP_W / 2;
  const tooltipY = top - TOOLTIP_H - 4;

  return (
    <>
      {/* Vertical crosshair */}
      <line
        x1={x}
        x2={x}
        y1={top}
        y2={bottom}
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="3 3"
        className="text-muted pointer-events-none"
      />

      {/* Dot at data point */}
      {dotY !== undefined && (
        <circle
          cx={x}
          cy={dotY}
          r="5"
          fill={dotColor}
          stroke="white"
          strokeWidth="2"
          className="pointer-events-none"
        />
      )}

      {/* Tooltip bubble */}
      <g className="pointer-events-none">
        <rect
          x={tooltipX}
          y={tooltipY}
          width={TOOLTIP_W}
          height={TOOLTIP_H}
          rx="5"
          ry="5"
          fill="currentColor"
          className="text-text drop-shadow-sm"
          opacity="0.92"
        />
        <text
          x={tooltipX + TOOLTIP_W / 2}
          y={tooltipY + (subLabel ? 9 : 13)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="8"
          fontWeight="700"
          fill="white"
        >
          {label}
        </text>
        {subLabel && (
          <text
            x={tooltipX + TOOLTIP_W / 2}
            y={tooltipY + 21}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7"
            fill="white"
            opacity="0.75"
          >
            {subLabel}
          </text>
        )}
      </g>
    </>
  );
}
