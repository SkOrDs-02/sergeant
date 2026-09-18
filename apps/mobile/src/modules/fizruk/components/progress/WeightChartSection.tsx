/**
 * WeightChartSection — body-weight trend card on the Fizruk Progress
 * screen.
 *
 * Mobile counterpart of the "Тренд ваги" card in
 * `apps/web/src/modules/fizruk/pages/Progress.tsx`. Renders either a
 * victory-native line chart or the same "замало точок" empty-state
 * copy the web screen shows.
 */
import { memo } from "react";
import { Text } from "react-native";

import { Card } from "@/components/ui/Card";

import { TrendChart } from "./TrendChart";
import type { MeasurementPoint } from "./types";

export interface WeightChartSectionProps {
  weightTrend: readonly MeasurementPoint[];
}

const WeightChartSectionImpl = function WeightChartSection({
  weightTrend,
}: WeightChartSectionProps) {
  return (
    <Card radius="lg" padding="lg" testID="fizruk-progress-weight">
      <Text className="text-xs font-semibold text-fg-muted mb-3">
        {"Тренд ваги"}
      </Text>
      <TrendChart
        series={weightTrend}
        strokeColor="#16a34a"
        unit=" кг"
        metricLabel="вагу тіла"
        testIDPrefix="fizruk-progress-weight"
      />
    </Card>
  );
};

export const WeightChartSection = memo(WeightChartSectionImpl);
