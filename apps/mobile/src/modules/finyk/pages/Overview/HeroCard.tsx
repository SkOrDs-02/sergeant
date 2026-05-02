/**
 * HeroCard — top gradient hero with networth, this-month balance and
 * cards/debt breakdown. Mobile port of
 * `apps/web/src/modules/finyk/pages/overview/HeroCard.tsx`.
 *
 * Uses expo-linear-gradient for premium gradient effect matching web.
 */
import { memo } from "react";
import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp } from "lucide-react-native";

import { cn } from "./cn";

export interface HeroCardProps {
  networth: number;
  monoTotal: number;
  totalDebt: number;
  monthBalance: number;
  firstName: string;
  dateLabel: string;
  showBalance?: boolean;
  /** Optional daily budget for progress indicator */
  dayBudget?: { spent: number; limit: number };
}

function format(value: number): string {
  return value.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

const HeroCardImpl = function HeroCard({
  networth,
  monoTotal,
  totalDebt,
  monthBalance,
  firstName,
  dateLabel,
  showBalance = true,
  dayBudget,
}: HeroCardProps) {
  const dayProgress = dayBudget
    ? Math.min(100, (dayBudget.spent / dayBudget.limit) * 100)
    : null;

  return (
    <LinearGradient
      colors={["#10b981", "#059669"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      className="rounded-3xl p-5"
      testID="finyk-overview-hero"
    >
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-emerald-50 text-sm">Загальний нетворс</Text>
          <Text className="text-xs text-emerald-200 mt-0.5 capitalize">
            {firstName} · {dateLabel}
          </Text>
        </View>
        <View className="w-8 h-8 rounded-full bg-white/15 items-center justify-center">
          <TrendingUp size={18} color="#fff" strokeWidth={2} />
        </View>
      </View>

      <Text
        className={cn(
          "text-white font-bold mt-2",
          showBalance ? "text-4xl" : "text-3xl tracking-widest",
        )}
      >
        {showBalance ? `${format(networth)} ₴` : "••••••"}
      </Text>

      {dayBudget && dayProgress !== null && (
        <View className="mt-3">
          <View className="flex-row justify-between mb-1">
            <Text className="text-emerald-100 text-xs">Денний бюджет</Text>
            <Text className="text-emerald-100 text-xs">
              {showBalance
                ? `${format(dayBudget.spent)} / ${format(dayBudget.limit)} ₴`
                : "•••• / •••• ₴"}
            </Text>
          </View>
          <View className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <View
              className={cn(
                "h-full rounded-full",
                dayProgress > 90 ? "bg-rose-300" : "bg-white/80",
              )}
              style={{ width: `${dayProgress}%` }}
            />
          </View>
        </View>
      )}

      <View className="mt-4 pt-4 border-t border-emerald-900/40 flex-row justify-between">
        <View>
          <Text className="text-emerald-200 text-xs">Картки</Text>
          <Text className="text-white font-semibold mt-1">
            {showBalance ? `${format(monoTotal)} ₴` : "••••"}
          </Text>
        </View>
        <View>
          <Text className="text-emerald-200 text-xs">Борги</Text>
          <Text className="text-white font-semibold mt-1">
            {showBalance ? `${format(totalDebt)} ₴` : "••••"}
          </Text>
        </View>
        <View>
          <Text className="text-emerald-200 text-xs">Місяць</Text>
          <Text
            className={cn(
              "font-semibold mt-1",
              monthBalance >= 0 ? "text-emerald-200" : "text-rose-300",
            )}
          >
            {showBalance
              ? `${monthBalance >= 0 ? "+" : "−"}${format(Math.abs(monthBalance))} ₴`
              : "••••"}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
};

export const HeroCard = memo(HeroCardImpl);
