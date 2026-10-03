/**
 * MonthPulseCard — spending/income summary + month forecast + pulse status.
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/overview/MonthPulseCard.tsx`.
 *
 * The pulse classification (accent colour / status text) comes from the
 * pure {@link computePulseStyle} helper in `@sergeant/finyk-domain` — same
 * logic as web, now shared.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import { computePulseStyle } from "@sergeant/finyk-domain/domain";

import { Card } from "../../../../components/ui/Card";
import { cn } from "./cn";
import { formatNumberUk } from "@sergeant/shared";

export interface MonthPulseCardProps {
  dateLabel: string;
  daysInMonth: number;
  daysPassed: number;
  spent: number;
  income: number;
  showBalance: boolean;
  showMonthForecast: boolean;
  projectedSpend: number;
  spendPct: number;
  expenseFromIncomeBarClass: string;
  forecastTrendPct: number;
  forecastBarClass: string;
  dayBudget: number;
  monthBalance: number;
  spendPlanRatio: number;
  hasExpensePlan: boolean;
  recurringOutThisMonth: number;
  recurringInThisMonth: number;
  unknownOutCount: number;
}

function fmt(n: number): string {
  return formatNumberUk(n, { maximumFractionDigits: 0 });
}

const MonthPulseCardImpl = function MonthPulseCard({
  dateLabel,
  daysInMonth,
  daysPassed,
  spent,
  income,
  showBalance,
  showMonthForecast,
  projectedSpend,
  spendPct,
  expenseFromIncomeBarClass,
  forecastTrendPct,
  forecastBarClass,
  dayBudget,
  monthBalance,
  spendPlanRatio,
  hasExpensePlan,
  recurringOutThisMonth,
  recurringInThisMonth,
  unknownOutCount,
}: MonthPulseCardProps) {
  const { accentLeft, bg, color, statusText } = computePulseStyle({
    hasExpensePlan,
    spendPlanRatio,
    dayBudget,
  });

  return (
    <Card
      variant="default"
      radius="lg"
      padding="lg"
      className={cn("border-l-4", accentLeft, bg)}
    >
      <View className="flex-row items-start justify-between mb-4">
        <View>
          <Text className="text-xs font-medium text-fg-muted">Місяць</Text>
          <Text className="text-xs text-fg-subtle mt-0.5 capitalize">
            {dateLabel}
          </Text>
        </View>
        <Text className="text-xs text-fg-subtle">
          {Math.max(0, daysInMonth - daysPassed)} дн. залишилось
        </Text>
      </View>

      <View className="flex-row justify-between items-start gap-4">
        <View>
          <Text className="text-xs text-fg-muted font-medium">Витрати</Text>
          <Text className="text-3xl font-bold mt-1 text-fg">
            {showBalance ? fmt(spent) : "••••"}
            {showBalance && (
              <Text className="text-base font-medium text-fg-subtle"> ₴</Text>
            )}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-fg-muted font-medium">Дохід</Text>
          <Text className="text-3xl font-bold mt-1 text-teal-700">
            {showBalance ? `+${fmt(income)}` : "••••"}
            {showBalance && (
              <Text className="text-base font-medium text-teal-700/70"> ₴</Text>
            )}
          </Text>
        </View>
      </View>

      <View className="mt-4">
        <View className="flex-row justify-between">
          <Text className="text-xs text-fg-muted">Витрати від доходу</Text>
          <Text className="text-xs text-fg-muted">
            {showBalance ? `${Math.round(spendPct)}%` : "—"}
          </Text>
        </View>
        <View className="h-1.5 bg-cream-100 rounded-full overflow-hidden mt-1.5">
          <View
            className={cn("h-full rounded-full", expenseFromIncomeBarClass)}
            style={{
              width: showBalance
                ? `${Math.min(100, Math.max(0, spendPct))}%`
                : "0%",
            }}
          />
        </View>
        <View className="flex-row justify-between mt-1.5">
          <Text className="text-xs text-fg-muted">
            {showBalance
              ? `Залишок: ${monthBalance >= 0 ? "+" : "−"}${fmt(Math.abs(monthBalance))} ₴`
              : "—"}
          </Text>
          <Text className="text-xs text-fg-muted">
            {showBalance && !showMonthForecast && projectedSpend > 0
              ? `Прогноз витрат ${fmt(projectedSpend)} ₴`
              : "—"}
          </Text>
        </View>
      </View>

      {showMonthForecast && (
        <View className="mt-4 pt-4 border-t border-cream-300">
          <Text className="text-xs font-medium text-fg-muted">
            Факт і прогноз витрат
          </Text>
          <Text className="text-xs text-fg-muted mt-2">
            За {daysPassed}{" "}
            {daysPassed === 1 ? "день" : daysPassed < 5 ? "дні" : "дн."} · факт{" "}
            <Text className="font-semibold text-fg">{fmt(spent)} ₴</Text>
            {" · "}до кінця місяця ~{" "}
            <Text className="font-semibold text-fg">
              {fmt(Math.round(projectedSpend))} ₴
            </Text>
          </Text>
          <View className="h-2.5 bg-cream-100 rounded-full overflow-hidden mt-2">
            <View
              className={cn("h-full rounded-full", forecastBarClass)}
              style={{
                width: `${Math.min(100, Math.max(0, forecastTrendPct))}%`,
              }}
            />
          </View>
          <Text className="text-xs text-fg-muted mt-1">
            {forecastTrendPct}% від прогнозу за темпом
          </Text>
        </View>
      )}

      <View className="mt-4 pt-4 border-t border-cream-300">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-medium text-fg-muted">Фінпульс</Text>
          <Text className="text-xs text-fg-subtle">
            цільова витрата на день
          </Text>
        </View>
        <Text
          className={cn(
            "font-bold mt-2",
            color,
            showBalance ? "text-3xl" : "text-2xl tracking-widest",
          )}
        >
          {showBalance ? (
            <>
              {fmt(Math.abs(dayBudget))}
              <Text className="text-base font-medium text-fg-muted">
                {" "}
                ₴/день
              </Text>
            </>
          ) : (
            "••••"
          )}
        </Text>
        <Text className={cn("text-sm mt-0.5", color)}>{statusText}</Text>
        {(recurringOutThisMonth > 0 || recurringInThisMonth > 0) &&
          showBalance && (
            <Text className="text-xs text-fg-muted mt-2">
              Враховано планових: −{fmt(recurringOutThisMonth)} / +
              {fmt(recurringInThisMonth)} ₴
              {unknownOutCount > 0 && ` + ${unknownOutCount} без суми`}
            </Text>
          )}
      </View>
    </Card>
  );
};

export const MonthPulseCard = memo(MonthPulseCardImpl);
