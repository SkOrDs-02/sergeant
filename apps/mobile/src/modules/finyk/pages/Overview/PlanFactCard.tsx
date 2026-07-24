/**
 * PlanFactCard — compact monthly-plan summary for the Overview tab.
 *
 * The full Plan / Fact / Δ table now lives inside `MonthlyPlanCard` on
 * the Планування tab to avoid duplicating the same numbers across two
 * screens. On Overview we surface a single-line summary that mirrors
 * the collapsed header of `MonthlyPlanCard` (pct + remaining or
 * over-budget badge) and tapping navigates the user to Планування for
 * details. Returns `null` when no plan is configured.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { Card } from "../../../../components/ui/Card";

export interface PlanFactCardProps {
  planIncome: number;
  planExpense: number;
  planSavings: number;
  income: number;
  spent: number;
  factSavings: number;
  onNavigate?: () => void;
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

const PlanFactCardImpl = function PlanFactCard({
  planIncome,
  planExpense,
  planSavings,
  spent,
  onNavigate,
}: PlanFactCardProps) {
  if (!(planIncome > 0 || planExpense > 0 || planSavings > 0)) return null;

  const pctExpense =
    planExpense > 0 ? Math.round((spent / planExpense) * 100) : 0;
  const isOver = planExpense > 0 && spent > planExpense;
  const overBy = spent - planExpense;
  const remaining = planExpense - spent;

  const summary = isOver
    ? `−${fmt(overBy)} ₴ понад план`
    : planExpense > 0
      ? `${pctExpense}% · залишок ${fmt(remaining)} ₴`
      : `+${fmt(planIncome)} ₴ план доходу`;

  const body = (
    <Card radius="lg" padding="lg">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-xs font-medium text-fg-muted">
            📅 Фінплан на місяць
          </Text>
          <Text
            className={
              isOver
                ? "text-sm font-semibold text-danger mt-1"
                : pctExpense >= 85
                  ? "text-sm font-semibold text-amber-700 mt-1"
                  : "text-sm font-semibold text-fg mt-1"
            }
          >
            {summary}
          </Text>
        </View>
        {onNavigate ? (
          <Text className="text-xs text-fg-subtle ml-3">›</Text>
        ) : null}
      </View>
      {planExpense > 0 ? (
        <View className="h-1.5 bg-cream-200 rounded-full overflow-hidden mt-3">
          <View
            style={{ width: `${Math.min(100, pctExpense)}%` }}
            className={
              isOver
                ? "h-full bg-danger"
                : pctExpense >= 85
                  ? "h-full bg-amber-500"
                  : "h-full bg-teal-700"
            }
          />
        </View>
      ) : null}
    </Card>
  );

  if (!onNavigate) return body;
  return (
    <Pressable
      onPress={onNavigate}
      accessibilityRole="button"
      accessibilityLabel="Відкрити Планування"
    >
      {body}
    </Pressable>
  );
};

export const PlanFactCard = memo(PlanFactCardImpl);
