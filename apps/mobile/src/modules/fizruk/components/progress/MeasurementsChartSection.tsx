/**
 * MeasurementsChartSection — body-fat-% trend card on the Fizruk
 * Progress screen.
 *
 * Mobile counterpart of the "Тренд % жиру" card in
 * `apps/web/src/modules/fizruk/pages/Progress.tsx`. A follow-up PR
 * will extend this component to show additional body-composition
 * metrics (neck / waist / hips). For now the single body-fat-% trend
 * matches the migration plan §4 / §6.7 scope.
 */
import { memo } from "react";
import { Text } from "react-native";

import { Card } from "@/components/ui/Card";

import { TrendChart } from "./TrendChart";
import type { MeasurementPoint } from "./types";

export interface MeasurementsChartSectionProps {
  bodyFatTrend: readonly MeasurementPoint[];
}

const MeasurementsChartSectionImpl = function MeasurementsChartSection({
  bodyFatTrend,
}: MeasurementsChartSectionProps) {
  return (
    <Card radius="lg" padding="lg" testID="fizruk-progress-bodyfat">
      <Text className="text-xs font-semibold text-fg-muted mb-3">
        {"Тренд % жиру"}
      </Text>
      <TrendChart
        series={bodyFatTrend}
        strokeColor="#eab308"
        unit="%"
        metricLabel="відсоток жиру"
        testIDPrefix="fizruk-progress-bodyfat"
      />
    </Card>
  );
};

export const MeasurementsChartSection = memo(MeasurementsChartSectionImpl);
