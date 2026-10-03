import { memo } from "react";
import { Text, View } from "react-native";

import { Card } from "@/components/ui/Card";

import { BudgetTrendChart, type ForecastDailyPoint } from "./BudgetTrendChart";
import { formatNumberUk } from "@sergeant/shared";

export interface BudgetForecastCardProps {
  categoryLabel: string;
  spent: number;
  limit: number;
  forecast: number;
  overLimit: boolean;
  overPercent: number;
  dailyData: ForecastDailyPoint[];
  testID?: string;
}

function fmt(n: number): string {
  return formatNumberUk(n, { maximumFractionDigits: 0 });
}

function BudgetForecastCardImpl({
  categoryLabel,
  spent,
  limit,
  forecast,
  overLimit,
  overPercent,
  dailyData,
  testID,
}: BudgetForecastCardProps) {
  return (
    <Card
      variant="default"
      radius="lg"
      padding="none"
      className="px-4 pt-3 pb-3"
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-1 min-w-0">
          <Text
            className="text-sm font-semibold text-fg"
            numberOfLines={1}
            testID={testID ? `${testID}-label` : undefined}
          >
            {categoryLabel}
          </Text>
          <Text className="text-[11px] text-fg-muted">
            Факт {fmt(spent)} ₴ · Прогноз{" "}
            <Text
              className={overLimit ? "text-danger font-semibold" : "text-fg"}
              testID={testID ? `${testID}-forecast` : undefined}
            >
              {fmt(forecast)} ₴
            </Text>
            {limit > 0 ? ` · Ліміт ${fmt(limit)} ₴` : ""}
          </Text>
        </View>
        {overLimit ? (
          <View className="rounded-full bg-danger/10 px-2 py-0.5 ml-2">
            <Text className="text-[11px] font-semibold text-danger">
              +{overPercent}%
            </Text>
          </View>
        ) : null}
      </View>
      <BudgetTrendChart
        dailyData={dailyData}
        limit={limit}
        testID={testID ? `${testID}-chart` : undefined}
      />
    </Card>
  );
}

export const BudgetForecastCard = memo(BudgetForecastCardImpl);
