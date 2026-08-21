import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { MonthlyPlanInput } from "@/modules/finyk/lib/budgetsStore";

export interface MonthlyPlanCardProps {
  monthlyPlan: MonthlyPlanInput;
  totalExpenseFact: number;
  factIncome: number;
  factSavings: number;
  remaining: number;
  pctExpense: number;
  isOver: boolean;
  safePerDay: number;
  daysLeft: number;
  onEdit: () => void;
  testID?: string;
}

function fmt(uah: number): string {
  return uah.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

function fmtSigned(uah: number): string {
  return `${uah >= 0 ? "+" : "−"}${fmt(Math.abs(uah))} ₴`;
}

function MonthlyPlanCardImpl({
  monthlyPlan,
  totalExpenseFact,
  factIncome,
  factSavings,
  remaining,
  pctExpense,
  isOver,
  safePerDay,
  daysLeft,
  onEdit,
  testID,
}: MonthlyPlanCardProps) {
  const planIncome = Number(monthlyPlan?.income || 0);
  const planExpense = Number(monthlyPlan?.expense || 0);
  const planSavings = Number(monthlyPlan?.savings || 0);
  const hasPlan = planIncome > 0 || planExpense > 0 || planSavings > 0;

  const incomeDelta = factIncome - planIncome;
  const expenseDelta = totalExpenseFact - planExpense;
  const savingsDelta = factSavings - planSavings;
  const overBy = totalExpenseFact - planExpense;

  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel="Редагувати місячний план"
      testID={testID}
      className={
        isOver
          ? "rounded-2xl border border-danger/40 bg-cream-50 px-5 py-4"
          : "rounded-2xl border border-cream-300 bg-cream-50 px-5 py-4"
      }
    >
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm font-semibold text-fg">Фінплан на місяць</Text>
        <Text className="text-xs text-fg-muted">✏️</Text>
      </View>

      {hasPlan ? (
        <>
          {/* Header row: (empty) | План | Факт | Δ */}
          <View className="flex-row items-center mb-1.5 px-1">
            <View className="w-16" />
            <Text className="flex-1 text-[10px] text-fg-muted text-right">
              План
            </Text>
            <Text className="flex-1 text-[10px] text-fg-muted text-right">
              Факт
            </Text>
            <Text className="flex-1 text-[10px] text-fg-muted text-right">
              Δ
            </Text>
          </View>

          {/* Дохід */}
          <View className="flex-row items-center mb-1 px-1">
            <Text className="w-16 text-xs text-fg-muted">Дохід</Text>
            <Text
              className="flex-1 text-right text-sm text-fg"
              testID={testID ? `${testID}-income` : undefined}
            >
              {planIncome > 0 ? `${fmt(planIncome)} ₴` : "—"}
            </Text>
            <Text className="flex-1 text-right text-sm text-emerald-600">
              {factIncome > 0 ? `+${fmt(factIncome)} ₴` : "—"}
            </Text>
            <Text
              className={
                planIncome === 0
                  ? "flex-1 text-right text-[11px] text-fg-subtle"
                  : incomeDelta >= 0
                    ? "flex-1 text-right text-[11px] text-emerald-600"
                    : "flex-1 text-right text-[11px] text-amber-600"
              }
            >
              {planIncome > 0 ? fmtSigned(incomeDelta) : "—"}
            </Text>
          </View>

          {/* Витрати */}
          <View className="flex-row items-center mb-1 px-1">
            <Text className="w-16 text-xs text-fg-muted">Витрати</Text>
            <Text className="flex-1 text-right text-sm text-fg">
              {planExpense > 0 ? `${fmt(planExpense)} ₴` : "—"}
            </Text>
            <Text
              className={
                isOver
                  ? "flex-1 text-right text-sm font-semibold text-danger"
                  : "flex-1 text-right text-sm text-rose-600"
              }
              testID={testID ? `${testID}-fact` : undefined}
            >
              −{fmt(totalExpenseFact)} ₴
            </Text>
            <Text
              className={
                planExpense === 0
                  ? "flex-1 text-right text-[11px] text-fg-subtle"
                  : expenseDelta > 0
                    ? "flex-1 text-right text-[11px] text-danger"
                    : "flex-1 text-right text-[11px] text-emerald-600"
              }
            >
              {planExpense > 0 ? fmtSigned(expenseDelta) : "—"}
            </Text>
          </View>

          {/* Накопичення */}
          <View className="flex-row items-center mb-2 px-1">
            <Text className="w-16 text-xs text-fg-muted">Накопич.</Text>
            <Text className="flex-1 text-right text-sm text-fg">
              {planSavings > 0 ? `${fmt(planSavings)} ₴` : "—"}
            </Text>
            <Text
              className={
                factSavings >= 0
                  ? "flex-1 text-right text-sm text-emerald-600"
                  : "flex-1 text-right text-sm text-rose-600"
              }
            >
              {fmtSigned(factSavings)}
            </Text>
            <Text
              className={
                planSavings === 0 && factSavings === 0
                  ? "flex-1 text-right text-[11px] text-fg-subtle"
                  : savingsDelta >= 0
                    ? "flex-1 text-right text-[11px] text-emerald-600"
                    : "flex-1 text-right text-[11px] text-danger"
              }
            >
              {planSavings > 0 || factSavings !== 0
                ? fmtSigned(savingsDelta)
                : "—"}
            </Text>
          </View>

          {planExpense > 0 ? (
            <>
              <View className="flex-row justify-between mb-1">
                <Text className="text-[11px] text-fg-muted">
                  {pctExpense}% витрачено
                </Text>
                <Text
                  className={
                    isOver
                      ? "text-[11px] text-danger font-semibold"
                      : "text-[11px] text-fg-muted"
                  }
                  testID={testID ? `${testID}-remaining` : undefined}
                >
                  {isOver
                    ? `−${fmt(overBy)} ₴ понад план`
                    : `Залишок ${fmt(remaining)} ₴`}
                </Text>
              </View>
              <View className="h-2 bg-cream-200 rounded-full overflow-hidden">
                <View
                  testID={testID ? `${testID}-progress` : undefined}
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
            </>
          ) : null}

          {safePerDay > 0 && daysLeft > 0 && planExpense > 0 ? (
            <View
              className={
                isOver
                  ? "mt-3 rounded-xl bg-danger/10 px-3 py-2"
                  : pctExpense >= 85
                    ? "mt-3 rounded-xl bg-amber-100 px-3 py-2"
                    : "mt-3 rounded-xl bg-emerald-100 px-3 py-2"
              }
            >
              <Text
                className={
                  isOver
                    ? "text-sm text-danger"
                    : pctExpense >= 85
                      ? "text-sm text-amber-800"
                      : "text-sm text-emerald-800"
                }
              >
                <Text className="font-semibold">{fmt(safePerDay)} ₴/день</Text>
                <Text className="text-xs"> · безпечно ({daysLeft} дн.)</Text>
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text className="text-sm text-fg-muted">
          Постав план, і побачиш скільки безпечно витрачати на день.
        </Text>
      )}
    </Pressable>
  );
}

export const MonthlyPlanCard = memo(MonthlyPlanCardImpl);
