/**
 * PlannedFlowsCard — upcoming payments (subscriptions / debts /
 * receivables) within the next 10 days.
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/overview/PlannedFlowsCard.tsx`.
 * Keeps presentation parity; the `plannedFlows` array itself is already
 * sorted / windowed by {@link @sergeant/finyk-domain#buildPlannedFlows}.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { PlannedFlow } from "@sergeant/finyk-domain/domain";

import { Card } from "../../../../components/ui/Card";
import { FlowRow } from "./FlowRow";

export interface PlannedFlowsCardProps {
  plannedFlows: readonly PlannedFlow[];
  onNavigate?: (route: "subscriptions") => void;
  showBalance?: boolean;
}

const PlannedFlowsCardImpl = function PlannedFlowsCard({
  plannedFlows,
  onNavigate,
  showBalance = true,
}: PlannedFlowsCardProps) {
  if (plannedFlows.length === 0) return null;
  return (
    <Card radius="lg" padding="lg">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-sm font-semibold text-fg">
          Заплановані платежі
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Підписки"
          onPress={() => onNavigate?.("subscriptions")}
        >
          <Text className="text-xs font-medium text-teal-700">Всі →</Text>
        </Pressable>
      </View>
      <View>
        {plannedFlows.map((flow, i) => (
          <FlowRow
            key={flow.id}
            flow={flow}
            showAmount={showBalance}
            isLast={i === plannedFlows.length - 1}
          />
        ))}
      </View>
    </Card>
  );
};

export const PlannedFlowsCard = memo(PlannedFlowsCardImpl);
