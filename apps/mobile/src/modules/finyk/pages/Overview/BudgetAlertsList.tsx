/**
 * BudgetAlertsList — cautionary pills for budgets at >60% / >=100% spent.
 *
 * Mobile port of `apps/web/src/modules/finyk/pages/overview/BudgetAlertsList.tsx`.
 * Re-uses the same pure selectors from `@sergeant/finyk-domain`
 * (`calcCategorySpent`, `resolveExpenseCategoryMeta`) that the web
 * version calls.
 */
import { memo } from "react";
import { Text, View } from "react-native";

import {
  calcCategorySpent,
  resolveExpenseCategoryMeta,
} from "@sergeant/finyk-domain";
import type {
  Budget,
  Category,
  Transaction,
  TxCategoriesMap,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain";

import { cn } from "./cn";

export interface BudgetAlertsListProps {
  budgetAlerts: Budget[];
  statTx: Transaction[];
  txCategories: TxCategoriesMap;
  txSplits: TxSplitsMap;
  customCategories: Category[];
}

const BudgetAlertsListImpl = function BudgetAlertsList({
  budgetAlerts,
  statTx,
  txCategories,
  txSplits,
  customCategories,
}: BudgetAlertsListProps) {
  if (budgetAlerts.length === 0) return null;
  return (
    <View className="gap-1.5">
      {budgetAlerts.map((b) => {
        const catId = b.categoryId ?? "";
        const cat = resolveExpenseCategoryMeta(catId, customCategories);
        const s = calcCategorySpent(
          statTx,
          catId,
          txCategories,
          txSplits,
          customCategories,
        );
        // Budget.limit є optional (нові бюджети без cap), тому coerce до 0
        // — pct=0 відобразиться так само як "ще нічого не витрачено".
        const limit = b.limit ?? 0;
        const pct = limit > 0 ? Math.round((s / limit) * 100) : 0;
        const over = pct >= 100;
        return (
          <View
            key={b.id}
            className={cn(
              "rounded-2xl px-4 py-3 flex-row items-center justify-between border",
              over
                ? "bg-rose-50 border-rose-200"
                : "bg-amber-50 border-amber-200",
            )}
          >
            <Text className="text-sm font-medium text-fg flex-1 mr-2">
              {cat?.label || catId}
            </Text>
            <Text
              className={cn(
                "text-sm font-bold",
                over ? "text-rose-600" : "text-amber-600",
              )}
            >
              {pct}% {over ? "⚠ перевищено" : "· понад 60% ліміту"}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export const BudgetAlertsList = memo(BudgetAlertsListImpl);
