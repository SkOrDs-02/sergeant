/**
 * `BodySummaryCard` — single tile in the Fizruk Body dashboard grid.
 *
 * Mirrors the "latest value + weekly delta" tiles at the top of
 * `apps/web/src/modules/fizruk/pages/Body.tsx`. Reads are pure — all
 * aggregation happens in `@sergeant/fizruk-domain/domain/body`, the
 * tile just picks the right copy, glyph, and colour bucket for the
 * resulting `BodyMetricSummary`.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import type {
  BodyMetricSummary,
  BodyTrendDirection,
} from "@sergeant/fizruk-domain/domain";

export interface BodySummaryCardProps {
  /** Short Ukrainian label shown at the top of the tile. */
  label: string;
  /** Unit suffix for the primary number (e.g. " кг", " год", "/5"). */
  unit: string;
  /** Pure-domain summary payload built by `buildBodySummary`. */
  summary: BodyMetricSummary;
  /**
   * How many decimal places to render. Defaults to 0 for integer
   * scores (energy / mood) and 1 otherwise.
   */
  fractionDigits?: number;
  /** Optional short icon / glyph shown next to the label. */
  glyph?: string;
  /** testID root (suffixes `-value` / `-delta` are appended). */
  testID?: string;
}

/**
 * Map a trend direction to a Ukrainian arrow glyph. Using ASCII
 * arrows keeps the tile readable in contexts where the font falls
 * back to system UI and emoji arrows render as boxes.
 */
function directionArrow(direction: BodyTrendDirection): string {
  switch (direction) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
      return "→";
    case "none":
      return "";
  }
}

/**
 * Colour bucket for the delta row. `down` is framed as positive for
 * weight-style metrics (losing weight is the "good" direction) so the
 * mapping is deliberately symmetric — callers can override via
 * `positiveDirection` when a metric (sleep, energy, mood) should flip
 * the mapping.
 */
function deltaClass(
  direction: BodyTrendDirection,
  positiveDirection: "up" | "down" | "flat",
): string {
  if (direction === "none") return "text-fg-subtle";
  if (direction === "flat") return "text-fg-muted";
  if (direction === positiveDirection) return "text-emerald-700";
  if (positiveDirection === "flat") return "text-fg-muted";
  return "text-amber-700";
}

/**
 * Ukrainian a11y label for the delta — screen readers should announce
 * "виросла на X" / "впала на X" / "без змін" instead of the glyph.
 */
function deltaA11yLabel(
  direction: BodyTrendDirection,
  delta: number | null,
  unit: string,
  windowDays: number,
): string {
  if (direction === "none" || delta == null) {
    return `Немає даних за ${windowDays} днів`;
  }
  if (direction === "flat") return `Без змін за ${windowDays} днів`;
  const magnitude = Math.abs(delta).toFixed(1);
  const verb = direction === "up" ? "виросла на" : "впала на";
  return `${verb} ${magnitude}${unit} за ${windowDays} днів`;
}

export interface BodySummaryCardPropsInternal extends BodySummaryCardProps {
  /**
   * Which delta direction the user wants for this metric. Weight
   * defaults to `down` (losing weight is framed as progress); sleep /
   * energy / mood should pass `up`.
   */
  positiveDirection?: "up" | "down" | "flat";
}

function formatNumber(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(fractionDigits);
}

const BodySummaryCardImpl = function BodySummaryCard({
  label,
  unit,
  summary,
  fractionDigits = 1,
  glyph,
  testID,
  positiveDirection = "up",
}: BodySummaryCardPropsInternal) {
  const { latest, delta, direction, windowDays } = summary;
  const valueStr =
    latest != null ? `${formatNumber(latest, fractionDigits)}${unit}` : "—";
  const arrow = directionArrow(direction);
  const deltaStr =
    delta != null
      ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatNumber(
          Math.abs(delta),
          fractionDigits,
        )}${unit}`
      : `—`;

  return (
    <View
      className="flex-1 min-w-[45%] rounded-2xl bg-cream-50 border border-cream-200 p-3"
      testID={testID}
      accessibilityLabel={`${label}: ${latest != null ? `${valueStr}, ${deltaA11yLabel(direction, delta, unit, windowDays)}` : "немає записів"}`}
    >
      <View className="flex-row items-center gap-1.5">
        {glyph ? (
          <Text className="text-sm" accessibilityElementsHidden>
            {glyph}
          </Text>
        ) : null}
        <Text className="text-[11px] uppercase tracking-wide text-fg-muted">
          {label}
        </Text>
      </View>
      <Text
        className="mt-1 text-xl font-extrabold text-fg tabular-nums"
        testID={testID ? `${testID}-value` : undefined}
      >
        {valueStr}
      </Text>
      <View className="mt-1 flex-row items-center gap-1">
        <Text
          className={`text-[11px] font-semibold tabular-nums ${deltaClass(
            direction,
            positiveDirection,
          )}`}
          testID={testID ? `${testID}-delta` : undefined}
        >
          {arrow ? `${arrow} ` : ""}
          {deltaStr}
        </Text>
        <Text className="text-[10px] text-fg-subtle">
          {`· ${windowDays} дн.`}
        </Text>
      </View>
    </View>
  );
};

export const BodySummaryCard = memo(BodySummaryCardImpl);
