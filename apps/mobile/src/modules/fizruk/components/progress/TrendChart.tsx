/**
 * TrendChart — shared victory-native area + line chart for Progress
 * measurement trends (body weight, body-fat %, …).
 *
 * Mobile port of `apps/web/src/modules/fizruk/components/MiniLineChart.tsx`.
 * Uses the same compact no-axis style as the Finyk
 * {@link import("../../../finyk/pages/Overview/NetworthSection.tsx").NetworthSection}
 * chart so cards stay visually consistent across modules.
 *
 * Empty-state copy mirrors the web counterpart so users see the same
 * messages when they have no samples or only one sample.
 */
import { memo } from "react";
import { Dimensions, Text, View } from "react-native";
import { VictoryArea, VictoryGroup, VictoryLine } from "victory-native";

import { countValidPoints } from "@sergeant/fizruk-domain/domain";

import type { MeasurementPoint } from "./types";

export interface TrendChartProps {
  /** Series points (oldest-first). `null` values are skipped. */
  series: readonly MeasurementPoint[];
  /** Stroke colour for the line and a derived translucent fill. */
  strokeColor: string;
  /** e.g. `"кг"` / `"%"`. Rendered next to the latest value. */
  unit: string;
  /** Descriptive name of the metric — used in empty-state copy. */
  metricLabel: string;
  /**
   * testID prefix for the outer view. Two suffixes are applied
   * automatically: `-empty` when the chart is collapsed to an
   * empty-state, `-chart` when a chart renders.
   */
  testIDPrefix: string;
}

/**
 * Convert the stroke colour into a translucent area-fill. Accepts
 * `#rrggbb` and `rgb(r g b)` formats (the ones used by the web
 * MiniLineChart call-sites). Unknown inputs fall back to a fixed
 * soft emerald fill.
 */
function deriveAreaFill(stroke: string): string {
  const hex = stroke.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r}, ${g}, ${b}, 0.18)`;
  }
  const rgb = stroke.trim().match(/^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, 0.18)`;
  }
  return "rgba(16, 185, 129, 0.18)";
}

const TrendChartImpl = function TrendChart({
  series,
  strokeColor,
  unit,
  metricLabel,
  testIDPrefix,
}: TrendChartProps) {
  const validCount = countValidPoints(series);

  if (validCount === 0) {
    return (
      <View
        testID={`${testIDPrefix}-empty`}
        className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4"
      >
        <Text className="text-sm font-semibold text-fg">
          {"Немає числових даних"}
        </Text>
        <Text className="text-xs text-fg-muted mt-1">
          {`Додай записи в розділі «Заміри», щоб відстежувати ${metricLabel}.`}
        </Text>
      </View>
    );
  }

  if (validCount < 2) {
    return (
      <View
        testID={`${testIDPrefix}-empty`}
        className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4"
      >
        <Text className="text-sm font-semibold text-fg">
          {"Замало точок для лінії"}
        </Text>
        <Text className="text-xs text-fg-muted mt-1">
          {`Потрібні щонайменше два заміри з ${metricLabel}, щоб побудувати тренд.`}
        </Text>
      </View>
    );
  }

  const points = series
    .map((p, i) => ({ x: i, y: p.value, raw: p }))
    .filter((p): p is { x: number; y: number; raw: MeasurementPoint } => {
      return p.y != null;
    });

  const latest = points[points.length - 1]!;
  const first = points[0]!;
  const delta = latest.y - first.y;

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.max(220, screenWidth - 80);
  const chartHeight = 96;
  const fill = deriveAreaFill(strokeColor);

  return (
    <View testID={`${testIDPrefix}-chart`}>
      <View className="flex-row items-baseline justify-between mb-2">
        <Text className="text-base font-bold text-fg tabular-nums">
          {`${latest.y}${unit}`}
        </Text>
        <Text
          testID={`${testIDPrefix}-delta`}
          className={
            delta > 0
              ? "text-xs font-semibold text-amber-700 tabular-nums"
              : delta < 0
                ? "text-xs font-semibold text-emerald-700 tabular-nums"
                : "text-xs font-semibold text-fg-muted tabular-nums"
          }
        >
          {`${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`}
        </Text>
      </View>
      <View accessibilityLabel={`Графік: ${metricLabel}`}>
        <VictoryGroup
          data={points.map((p) => ({ x: p.x, y: p.y }))}
          width={chartWidth}
          height={chartHeight}
          padding={{ top: 6, bottom: 6, left: 6, right: 6 }}
          standalone={true}
        >
          <VictoryArea
            interpolation="monotoneX"
            style={{ data: { fill, stroke: "transparent" } }}
          />
          <VictoryLine
            interpolation="monotoneX"
            style={{ data: { stroke: strokeColor, strokeWidth: 2 } }}
          />
        </VictoryGroup>
      </View>
      <View className="flex-row items-center justify-between mt-1">
        <Text className="text-[10px] text-fg-subtle">{first.raw.label}</Text>
        <Text className="text-[10px] text-fg-subtle">{latest.raw.label}</Text>
      </View>
    </View>
  );
};

export const TrendChart = memo(TrendChartImpl);
