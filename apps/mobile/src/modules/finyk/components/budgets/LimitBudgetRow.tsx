import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { LimitBudget } from "@sergeant/finyk-domain/domain";

import { Sparkline } from "./Sparkline";

export interface LimitBudgetRowProps {
  budget: LimitBudget;
  categoryLabel: string;
  spent: number;
  pctRaw: number;
  pctRounded: number;
  remaining: number;
  overLimit: boolean;
  warnLimit: boolean;
  /** Per-day spend in the current month, used for the row sparkline. */
  trend?: readonly number[];
  onEdit: () => void;
  testID?: string;
}

function fmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

function LimitBudgetRowImpl({
  budget,
  categoryLabel,
  spent,
  pctRaw,
  pctRounded,
  remaining,
  overLimit,
  warnLimit,
  trend,
  onEdit,
  testID,
}: LimitBudgetRowProps) {
  const barWidth = `${Math.min(100, Math.max(0, pctRaw))}%` as const;
  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Редагувати ліміт ${categoryLabel}`}
      testID={testID}
      className="rounded-2xl border border-cream-300 bg-white px-4 py-3"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text
          className="text-sm font-semibold text-fg flex-1"
          numberOfLines={1}
        >
          {categoryLabel || "—"}
        </Text>
        <Text
          className={
            overLimit
              ? "text-xs font-semibold text-danger"
              : warnLimit
                ? "text-xs text-amber-600"
                : "text-xs text-fg-muted"
          }
          testID={testID ? `${testID}-amount` : undefined}
        >
          {fmt(spent)} / {fmt(Number(budget.limit) || 0)} ₴
        </Text>
      </View>
      {trend && trend.length > 0 ? (
        <View
          className="mb-2"
          testID={testID ? `${testID}-sparkline` : undefined}
        >
          <Sparkline
            values={trend}
            tone={overLimit ? "danger" : warnLimit ? "warn" : "positive"}
            height={16}
          />
        </View>
      ) : null}
      <View className="h-2 bg-cream-200 rounded-full overflow-hidden">
        <View
          style={{ width: barWidth }}
          className={
            overLimit
              ? "h-full bg-danger"
              : warnLimit
                ? "h-full bg-amber-500"
                : "h-full bg-emerald-500"
          }
        />
      </View>
      <Text
        className={
          overLimit
            ? "text-xs text-danger mt-2"
            : warnLimit
              ? "text-xs text-amber-700 mt-2"
              : "text-xs text-fg-muted mt-2"
        }
        testID={testID ? `${testID}-status` : undefined}
      >
        {overLimit
          ? `Перевищено на ${fmt(spent - (Number(budget.limit) || 0))} ₴`
          : `Залишок ${fmt(remaining)} ₴ · ${pctRounded}%`}
      </Text>
    </Pressable>
  );
}

export const LimitBudgetRow = memo(LimitBudgetRowImpl);
