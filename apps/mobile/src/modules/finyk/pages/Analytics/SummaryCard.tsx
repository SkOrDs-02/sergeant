/**
 * SummaryCard — 3-column "Витрати / Дохід / Баланс" for the selected
 * month. Mobile port of the inline "Підсумок місяця" section in
 * `apps/web/src/modules/finyk/pages/Analytics.tsx`.
 *
 * Feeds off `getMonthlySummary` (see `@sergeant/finyk-domain`) so the
 * numbers are identical between web and mobile.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import type { MonthlySummary } from "@sergeant/finyk-domain/domain";

import { Skeleton } from "../../../../components/ui/Skeleton";
import { formatNumberUk } from "@sergeant/shared";

export interface SummaryCardProps {
  summary: MonthlySummary;
  loading?: boolean;
}

function fmt(uah: number): string {
  return formatNumberUk(uah);
}

function SummaryCardComponent({ summary, loading }: SummaryCardProps) {
  if (loading) {
    return (
      <View
        className="flex-row gap-3"
        testID="finyk-analytics-summary-skeleton"
      >
        <Skeleton className="h-12 flex-1 rounded-xl" />
        <Skeleton className="h-12 flex-1 rounded-xl" />
        <Skeleton className="h-12 flex-1 rounded-xl" />
      </View>
    );
  }

  const balancePositive = summary.balance >= 0;

  return (
    <View className="flex-row gap-3" testID="finyk-analytics-summary">
      <View className="flex-1 items-center">
        <Text className="text-[10px] text-fg-muted mb-1">Витрати</Text>
        <Text className="text-sm font-bold tabular-nums text-rose-600">
          {fmt(summary.spent)} ₴
        </Text>
      </View>
      <View className="flex-1 items-center">
        <Text className="text-[10px] text-fg-muted mb-1">Дохід</Text>
        <Text className="text-sm font-bold tabular-nums text-emerald-600">
          {fmt(summary.income)} ₴
        </Text>
      </View>
      <View className="flex-1 items-center">
        <Text className="text-[10px] text-fg-muted mb-1">Баланс</Text>
        <Text
          className={
            "text-sm font-bold tabular-nums " +
            (balancePositive ? "text-emerald-600" : "text-rose-600")
          }
        >
          {balancePositive ? "+" : ""}
          {fmt(summary.balance)} ₴
        </Text>
      </View>
    </View>
  );
}

export const SummaryCard = memo(SummaryCardComponent);
