/**
 * NetworthSection — 6-month networth sparkline (area + line).
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/overview/NetworthSection.tsx`
 * plus the web's lazy-loaded `NetworthChart`. Per the RN migration plan
 * §6.7 (Q7 MVP) charts are rendered through `victory-native`; we keep the
 * rendered SVG compact (no axes, no labels) so it stays inside the Card.
 *
 * Shows a dashed placeholder with copy identical to web when there is
 * less than 2 data points, so users get the same empty-state message
 * across platforms.
 */
import { memo } from "react";
import { Dimensions, Text, View } from "react-native";
import { VictoryArea, VictoryLine, VictoryGroup } from "victory-native";

import { Card } from "../../../../components/ui/Card";
import type { NetworthPoint } from "./types";

export interface NetworthSectionProps {
  networthHistory: NetworthPoint[];
}

/**
 * Same teal palette the web chart uses (`stroke` / soft fill) — kept
 * in sync with `apps/web/src/modules/finyk/components/charts/NetworthChart.tsx`.
 * 2026-07: shifted from emerald-500 to teal-700 (brand shift).
 */
const STROKE = "#0f766e"; // teal-700
const FILL = "rgba(15, 118, 110, 0.18)";

const NetworthSectionImpl = function NetworthSection({
  networthHistory,
}: NetworthSectionProps) {
  if (networthHistory.length < 2) {
    return (
      <Card
        variant="default"
        radius="lg"
        padding="xl"
        className="border-dashed"
      >
        <Text
          className="text-sm text-fg-muted text-center"
          testID="finyk-overview-networth-empty"
        >
          Ще мало знімків для графіка нетворсу, зʼявиться після кількох змін
          балансу.
        </Text>
      </Card>
    );
  }

  const screenWidth = Dimensions.get("window").width;
  const chartWidth = Math.max(220, screenWidth - 40);
  const chartHeight = 80;

  const data = networthHistory.map((p, i) => ({ x: i, y: p.value }));

  return (
    <Card
      variant="default"
      radius="lg"
      padding="none"
      className="px-5 pt-4 pb-3"
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xs font-medium text-fg-muted">
          Динаміка нетворсу
        </Text>
        <Text className="text-xs text-fg-subtle">
          {networthHistory.length} міс.
        </Text>
      </View>
      <View testID="finyk-overview-networth-chart">
        <VictoryGroup
          data={data}
          width={chartWidth}
          height={chartHeight}
          padding={{ top: 6, bottom: 6, left: 6, right: 6 }}
          standalone={true}
        >
          <VictoryArea
            interpolation="monotoneX"
            style={{ data: { fill: FILL, stroke: "transparent" } }}
          />
          <VictoryLine
            interpolation="monotoneX"
            style={{ data: { stroke: STROKE, strokeWidth: 2 } }}
          />
        </VictoryGroup>
      </View>
    </Card>
  );
};

export const NetworthSection = memo(NetworthSectionImpl);
