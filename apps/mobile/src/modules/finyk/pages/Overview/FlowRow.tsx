/**
 * One planned-flow row inside `PlannedFlowsCard` / `MonthPulseCard`.
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/overview/FlowRow.tsx`.
 * Uses the pure `PlannedFlow.color === OVERVIEW_FLOW_COLOR.success` check
 * to pick between success / danger text tokens — same branching as web.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import { OVERVIEW_FLOW_COLOR } from "@sergeant/finyk-domain/domain";
import type { PlannedFlow } from "@sergeant/finyk-domain/domain";

import { cn } from "./cn";
import { formatNumberUk } from "@sergeant/shared";

export interface FlowRowProps {
  flow: PlannedFlow;
  showAmount?: boolean;
  isLast?: boolean;
}

function format(n: number): string {
  return formatNumberUk(n, { maximumFractionDigits: 0 });
}

export const FlowRow = memo(function FlowRow({
  flow,
  showAmount = true,
  isLast = false,
}: FlowRowProps) {
  const isGreen = flow.color === OVERVIEW_FLOW_COLOR.success;
  return (
    <View
      className={cn(
        "flex-row justify-between items-center py-3",
        !isLast && "border-b border-cream-300",
      )}
    >
      <View className="flex-1 mr-3">
        <Text className="text-base font-medium text-fg" numberOfLines={1}>
          {flow.title}
        </Text>
        <Text className="text-xs text-fg-muted mt-0.5">{flow.hint}</Text>
      </View>
      <Text
        className={cn(
          "text-base font-bold",
          isGreen ? "text-emerald-600" : "text-rose-600",
        )}
      >
        {showAmount
          ? (flow.amount === null
              ? `${flow.sign}?`
              : `${flow.sign}${format(flow.amount)}`) + ` ${flow.currency}`
          : "••••"}
      </Text>
    </View>
  );
});
