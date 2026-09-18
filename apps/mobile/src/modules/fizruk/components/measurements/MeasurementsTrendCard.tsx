/**
 * `MeasurementsTrendCard` — header card on the Fizruk Measurements
 * page that surfaces a compact weight trend. Re-uses the shared
 * {@link import("../progress/TrendChart.js").TrendChart} primitive
 * (merged in #462) — do NOT duplicate the chart shell here.
 *
 * The card renders a TrendChart for the last N weight samples from
 * `useMeasurements`. When there are no entries at all the card
 * collapses to an empty-state message — the chart's own empty-state
 * copy is specific to "one sample" cases, so a zero-entry list gets
 * its own friendlier card-level message here.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import {
  buildWeightTrend,
  type MobileMeasurementEntry,
  type ProgressMeasurementInput,
} from "@sergeant/fizruk-domain/domain";

import { TrendChart } from "../progress/TrendChart";

export interface MeasurementsTrendCardProps {
  /** Newest-first entries (contract of `useMeasurements`). */
  entries: readonly MobileMeasurementEntry[];
  /** testID root — `-chart` / `-empty` suffixes are applied by TrendChart. */
  testID?: string;
}

/**
 * `MobileMeasurementEntry` is a structural subset of
 * `ProgressMeasurementInput` but does not declare the latter's open
 * index signature. Spreading through a plain object lets the trend
 * builder consume our entries without widening the persisted type.
 */
function toProgressInputs(
  entries: readonly MobileMeasurementEntry[],
): ProgressMeasurementInput[] {
  return entries.map((e) => ({ ...e }));
}

const TrendCardImpl = function MeasurementsTrendCard({
  entries,
  testID = "fizruk-measurements-trend",
}: MeasurementsTrendCardProps) {
  const weightSeries = buildWeightTrend(toProgressInputs(entries));

  return (
    <View
      className="rounded-2xl bg-cream-50 border border-cream-200 p-4"
      testID={testID}
    >
      <View className="flex-row items-baseline justify-between mb-2">
        <Text className="text-sm font-semibold text-fg">Тренд ваги</Text>
        <Text className="text-[11px] text-fg-muted">останні 8</Text>
      </View>
      <TrendChart
        series={weightSeries}
        strokeColor="#0f766e"
        unit=" кг"
        metricLabel="вагу"
        testIDPrefix={testID}
      />
    </View>
  );
};

export const MeasurementsTrendCard = memo(TrendCardImpl);
