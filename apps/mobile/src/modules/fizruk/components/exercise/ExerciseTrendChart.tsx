/**
 * `ExerciseTrendChart` — compact victory-native line+area chart for the
 * Exercise detail screen. Renders a 12-week (or fewer) series of
 * `ExerciseTrendPoint`s with empty / single-point fallbacks that
 * mirror the Progress page {@link import("../progress/TrendChart.tsx").TrendChart}.
 */
import type { ExerciseTrendPoint } from "@sergeant/fizruk-domain/domain";
import { memo } from "react";
import { Dimensions, Text, View } from "react-native";
import { VictoryArea, VictoryGroup, VictoryLine } from "victory-native";

export interface ExerciseTrendChartProps {
  /** Oldest-first list of bucketed points (kg, volume, etc.). */
  points: readonly ExerciseTrendPoint[];
  /** Line / area stroke colour — accepts `#rrggbb` or `rgb(r g b)`. */
  strokeColor: string;
  /** Unit suffix rendered next to the latest value (e.g. `"кг"`). */
  unit: string;
  /** Human label for a11y copy and empty-state ("Прогресія 1RM"). */
  label: string;
  /** testID prefix; `-empty` and `-chart` suffixes are applied. */
  testIDPrefix: string;
}

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

const ExerciseTrendChartImpl = function ExerciseTrendChart({
  points,
  strokeColor,
  unit,
  label,
  testIDPrefix,
}: ExerciseTrendChartProps) {
  const valid = points.filter((p) => Number.isFinite(p.value));

  if (valid.length === 0) {
    return (
      <View
        testID={`${testIDPrefix}-empty`}
        className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4"
      >
        <Text className="text-sm font-semibold text-fg">
          Немає даних для графіка
        </Text>
        <Text className="text-xs text-fg-muted mt-1">
          Заверши хоча б один силовий підхід, щоб побачити тренд.
        </Text>
      </View>
    );
  }

  if (valid.length < 2) {
    return (
      <View
        testID={`${testIDPrefix}-empty`}
        className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4"
      >
        <Text className="text-sm font-semibold text-fg">
          Замало точок для лінії
        </Text>
        <Text className="text-xs text-fg-muted mt-1">
          {`Потрібні щонайменше два тижні з даними, щоб побудувати ${label.toLowerCase()}.`}
        </Text>
      </View>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.max(220, screenWidth - 80);
  const chartHeight = 96;
  const fill = deriveAreaFill(strokeColor);

  const data = valid.map((p, i) => ({ x: i, y: p.value }));
  const latest = valid[valid.length - 1]!;
  const first = valid[0]!;
  const delta = latest.value - first.value;

  return (
    <View testID={`${testIDPrefix}-chart`}>
      <View className="flex-row items-baseline justify-between mb-2">
        <Text className="text-base font-bold text-fg tabular-nums">
          {`${latest.value}${unit}`}
        </Text>
        <Text
          testID={`${testIDPrefix}-delta`}
          className={
            delta > 0
              ? "text-xs font-semibold text-emerald-700 tabular-nums"
              : delta < 0
                ? "text-xs font-semibold text-amber-700 tabular-nums"
                : "text-xs font-semibold text-fg-muted tabular-nums"
          }
        >
          {`${delta > 0 ? "+" : ""}${delta}${unit}`}
        </Text>
      </View>
      <View accessibilityLabel={`Графік: ${label}`}>
        <VictoryGroup
          data={data}
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
            style={{
              data: { stroke: strokeColor, strokeWidth: 2 },
            }}
          />
        </VictoryGroup>
      </View>
      <View className="flex-row justify-between mt-1">
        <Text className="text-[10px] text-fg-subtle">{first.dateLabel}</Text>
        <Text className="text-[10px] text-fg-subtle">{latest.dateLabel}</Text>
      </View>
    </View>
  );
};

export const ExerciseTrendChart = memo(ExerciseTrendChartImpl);
