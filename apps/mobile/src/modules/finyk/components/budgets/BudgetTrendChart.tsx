import { memo } from "react";
import { Dimensions, Text, View } from "react-native";
import {
  VictoryArea,
  VictoryAxis,
  VictoryGroup,
  VictoryLine,
} from "victory-native";

export interface ForecastDailyPoint {
  day: number;
  actual: number | null;
  forecast: number | null;
}

export interface BudgetTrendChartProps {
  dailyData: ForecastDailyPoint[];
  limit: number;
  height?: number;
  testID?: string;
}

const ACTUAL_STROKE = "#10b981";
const ACTUAL_FILL = "rgba(16, 185, 129, 0.18)";
const FORECAST_STROKE = "#f59e0b";
const LIMIT_STROKE = "#dc2626";

function BudgetTrendChartImpl({
  dailyData,
  limit,
  height = 140,
  testID,
}: BudgetTrendChartProps) {
  if (!Array.isArray(dailyData) || dailyData.length < 2) {
    return (
      <View className="rounded-xl border border-dashed border-cream-300 px-4 py-6">
        <Text
          className="text-xs text-fg-muted text-center"
          testID={testID ? `${testID}-empty` : undefined}
        >
          Замало даних для прогнозу — повертайся за кілька днів.
        </Text>
      </View>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.max(220, screenWidth - 64);

  const actualPoints = dailyData
    .filter((p) => p.actual != null)
    .map((p) => ({ x: p.day, y: Number(p.actual) }));
  const forecastPoints = dailyData
    .filter((p) => p.forecast != null)
    .map((p) => ({ x: p.day, y: Number(p.forecast) }));
  const limitPoints =
    limit > 0
      ? [
          { x: dailyData[0]!.day, y: limit },
          { x: dailyData[dailyData.length - 1]!.day, y: limit },
        ]
      : [];

  return (
    <View testID={testID}>
      <VictoryGroup
        width={chartWidth}
        height={height}
        padding={{ top: 8, bottom: 24, left: 32, right: 8 }}
        standalone={true}
      >
        <VictoryAxis
          tickFormat={(t: number) => String(t)}
          style={{
            axis: { stroke: "transparent" },
            tickLabels: { fontSize: 9, fill: "#78716c" },
            grid: { stroke: "transparent" },
          }}
          tickCount={4}
        />
        {actualPoints.length > 1 ? (
          <VictoryArea
            data={actualPoints}
            interpolation="monotoneX"
            style={{ data: { fill: ACTUAL_FILL, stroke: "transparent" } }}
          />
        ) : null}
        {actualPoints.length > 1 ? (
          <VictoryLine
            data={actualPoints}
            interpolation="monotoneX"
            style={{ data: { stroke: ACTUAL_STROKE, strokeWidth: 2 } }}
          />
        ) : null}
        {forecastPoints.length > 1 ? (
          <VictoryLine
            data={forecastPoints}
            interpolation="monotoneX"
            style={{
              data: {
                stroke: FORECAST_STROKE,
                strokeWidth: 2,
                strokeDasharray: "4 4",
              },
            }}
          />
        ) : null}
        {limitPoints.length > 0 ? (
          <VictoryLine
            data={limitPoints}
            style={{
              data: {
                stroke: LIMIT_STROKE,
                strokeWidth: 1.5,
                strokeDasharray: "2 4",
              },
            }}
          />
        ) : null}
      </VictoryGroup>
      <View className="flex-row gap-3 mt-1 px-2">
        <Text className="text-[10px] text-emerald-700">● Факт</Text>
        <Text className="text-[10px] text-amber-700">┄ Прогноз</Text>
        {limit > 0 ? (
          <Text className="text-[10px] text-danger">┄ Ліміт</Text>
        ) : null}
      </View>
    </View>
  );
}

export const BudgetTrendChart = memo(BudgetTrendChartImpl);
