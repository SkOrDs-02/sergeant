/**
 * ComparisonCard — month-over-month spend & income deltas.
 *
 * Mobile port of the "Порівняння з попереднім місяцем" section +
 * `ComparisonRow` sub-component from `apps/web/src/modules/finyk/
 * pages/Analytics.tsx`. Consumes a `TrendComparison` produced by
 * `getTrendComparison` in `@sergeant/finyk-domain` so the numbers
 * match web verbatim.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import type { TrendComparison } from "@sergeant/finyk-domain/domain";
import { formatNumberUk } from "@sergeant/shared";

export type ComparisonKind = "expense" | "income";

interface ComparisonRowProps {
  label: string;
  current: number;
  prev: number;
  kind?: ComparisonKind;
}

function fmt(uah: number): string {
  return formatNumberUk(uah);
}

function ComparisonRow({
  label,
  current,
  prev,
  kind = "expense",
}: ComparisonRowProps) {
  const diff = current - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  const up = diff > 0;
  const upIsGood = kind === "income";
  const good = diff === 0 ? null : up === upIsGood;
  const tint =
    good === null
      ? "text-fg-muted"
      : good
        ? "text-emerald-600"
        : "text-rose-600";

  return (
    <View
      className="flex-row items-center justify-between"
      testID={`finyk-analytics-compare-${kind}`}
    >
      <Text className="text-sm text-fg-muted">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="text-sm font-medium text-fg tabular-nums">
          {fmt(current)} ₴
        </Text>
        {prev > 0 && pct !== null ? (
          <Text className={"text-xs tabular-nums " + tint}>
            {up ? "+" : ""}
            {pct}%
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export interface ComparisonCardProps {
  comparison: TrendComparison;
}

function ComparisonCardComponent({ comparison }: ComparisonCardProps) {
  return (
    <View className="gap-2" testID="finyk-analytics-comparison">
      <ComparisonRow
        label="Витрати"
        current={comparison.currentSpent}
        prev={comparison.prevSpent}
      />
      <ComparisonRow
        label="Дохід"
        current={comparison.currentIncome}
        prev={comparison.prevIncome}
        kind="income"
      />
    </View>
  );
}

export const ComparisonCard = memo(ComparisonCardComponent);
