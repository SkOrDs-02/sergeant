/**
 * Finyk — TxRow (React Native)
 *
 * Mobile port of `apps/web/src/modules/finyk/components/TxRow.tsx`.
 *
 * **Scope of this PR (PR3):** display-only row. The web file also hosts
 * the inline category-picker popover and the split-editor modal, which
 * depend on `Popover` / `portal` plumbing that isn't yet ported to
 * mobile. Those live-edit affordances will land in a follow-up PR —
 * mobile callers for now trigger category changes via the
 * `ManualExpenseSheet` or via dedicated screens.
 *
 * Parity notes with the web component:
 * - Same row layout: category glyph → description + metadata pill row
 *   → amount block.
 * - Same metadata pills: "не в статистиці" (internal transfer),
 *   "змін." (override), "⅔ спліт", "💳 <account>" (credit card),
 *   "П24" (PrivatBank source), plus the date.
 * - Same income/expense colour split (income → brand accent, expense →
 *   default text colour).
 * - Same hide/strike-through treatment for muted rows.
 * - Same `React.memo` wrap — row is the hot path of a virtualised
 *   list and props are stable across scroll frames.
 *
 * Differences from web (intentional):
 * - `onClick` → `onPress`, a single `Pressable` wraps the whole row
 *   instead of a nested `<button>` inside a `<div>`.
 * - Class strings use the mobile NativeWind surface (brand tokens +
 *   cream fallbacks) — same caveat as `Card` / `Button` until mobile
 *   CSS-variable wiring lands.
 * - `tabular-nums` is expressed via `fontVariant: ["tabular-nums"]` on
 *   `Text` since NativeWind v4 doesn't rewrite the utility.
 */

import { memo, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  CURRENCY,
  INCOME_CATEGORIES,
  INTERNAL_TRANSFER_ID,
  MCC_CATEGORIES,
  fmtAmt,
  fmtDate,
  getCategory,
  getIncomeCategory,
} from "@sergeant/finyk-domain";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

/**
 * Мінімальна форма транзакції, яку рендерить рядок. Свідомо НЕ імпортуємо
 * повний `Transaction` з finyk-domain — рядок бачить і нормалізовані, і
 * сирі monobank-записи (різні точки виклику persist різні shape-и: Mono
 * statement entries, manual-expenses, merged splits), тому лишаємо тільки
 * реально читані поля. Mirrors the web twin (`TxRowTx`) byte-for-byte —
 * shapes drift in lockstep across web/mobile.
 */
export interface TxRowTx {
  id: string;
  amount: number;
  description?: string;
  mcc?: number;
  time?: number;
  currencyCode?: number;
  operationAmount?: number;
  _accountId?: string | null;
  _source?: string;
  _manual?: boolean;
  _manualId?: string;
}

export interface TxRowProps {
  tx: TxRowTx;
  onPress?: () => void;
  highlighted?: boolean;
  hidden?: boolean;
  overrideCatId?: string | null;
  accounts?: readonly MonoAccount[];
  hideAmount?: boolean;
  txSplits?: TxSplitsMap;
  customCategories?: readonly CustomCategoryInput[];
  /**
   * Propagated to the row's outer `Pressable` / `View` so Detox E2E
   * can match a specific transaction by id (see the first suite in
   * `apps/mobile/e2e/finyk-manual-expense.e2e.ts`). No-op on web twin.
   */
  testID?: string;
}

const INCOME_ICONS: Record<string, string> = {
  in_salary: "💰",
  in_freelance: "💻",
  [INTERNAL_TRANSFER_ID]: "↔️",
  in_cashback: "🎁",
  in_pension: "🏛️",
  in_other: "📥",
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  black: "Чорна",
  white: "Біла",
  platinum: "Platinum",
  iron: "Iron",
  fop: "ФОП",
  yellow: "Жовта",
};

function getAccountShortName(
  acc: MonoAccount | undefined | null,
): string | null {
  if (!acc) return null;
  return ACCOUNT_TYPE_LABEL[acc.type ?? ""] || acc.type || "Рахунок";
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// Keep the ESLint rule exempt — INCOME_CATEGORIES / MCC_CATEGORIES are
// consumed inside `getCategory` / `getIncomeCategory` and we re-import
// them only to keep the module self-documenting alongside the web twin.
void INCOME_CATEGORIES;
void MCC_CATEGORIES;

function TxRowImpl({
  tx,
  onPress,
  highlighted,
  hidden,
  overrideCatId,
  accounts,
  hideAmount = false,
  txSplits,
  customCategories = [],
  testID,
}: TxRowProps) {
  const isIncome = tx.amount > 0;

  const cat = useMemo(
    () =>
      isIncome
        ? getIncomeCategory(tx.description ?? "", overrideCatId)
        : getCategory(
            tx.description ?? "",
            tx.mcc ?? 0,
            overrideCatId,
            customCategories,
          ),
    [isIncome, tx.description, tx.mcc, overrideCatId, customCategories],
  );

  const catIcon = isIncome
    ? (INCOME_ICONS[cat.id] ?? "📥")
    : cat.label.split(" ")[0];
  const catName = isIncome
    ? cat.label
    : cat.label.slice(cat.label.indexOf(" ") + 1);

  const account = accounts?.find((a) => a.id === tx._accountId);
  const isCreditCard = (account?.creditLimit ?? 0) > 0;
  const accountName = getAccountShortName(account);

  const existingSplits = txSplits?.[tx.id] ?? [];
  const hasSplit = existingSplits.length > 0;

  const body = (
    <View
      className={cx(
        "flex-row items-center justify-between py-3 px-3 border-b border-cream-300",
        highlighted && "bg-brand-50 rounded-xl border-0 my-0.5 px-2",
        hidden && "opacity-40",
      )}
      testID={onPress ? undefined : testID}
    >
      <View className="flex-row items-center flex-1 min-w-0 pr-3">
        <Text className="text-xl mr-3" accessibilityElementsHidden>
          {highlighted ? "✅" : catIcon}
        </Text>
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            className={cx(
              "text-sm font-medium text-fg",
              hidden && "line-through",
            )}
          >
            {tx.description || "Транзакція"}
          </Text>
          <View className="flex-row flex-wrap items-center mt-0.5">
            <Text className="text-xs text-fg-muted mr-1.5">{catName}</Text>
            {cat.id === INTERNAL_TRANSFER_ID && (
              <View className="bg-panelHi rounded-full px-1.5 py-0.5 mr-1.5">
                <Text className="text-[10px] font-semibold text-fg">
                  не в статистиці
                </Text>
              </View>
            )}
            {overrideCatId && cat.id !== INTERNAL_TRANSFER_ID && (
              <View className="bg-panelHi rounded-full px-1.5 py-0.5 mr-1.5">
                <Text className="text-[10px] font-semibold text-fg">змін.</Text>
              </View>
            )}
            {hasSplit && (
              <View className="bg-brand-100 rounded-full px-1.5 py-0.5 mr-1.5">
                <Text className="text-[10px] font-semibold text-brand-700">
                  ⅔ спліт
                </Text>
              </View>
            )}
            {isCreditCard && accountName && (
              <View className="bg-danger/10 rounded-full px-1.5 py-0.5 mr-1.5">
                <Text className="text-[10px] font-semibold text-danger">
                  💳 {accountName}
                </Text>
              </View>
            )}
            {!isCreditCard && accountName && (
              <Text className="text-[10px] text-fg-subtle mr-1.5">
                {accountName}
              </Text>
            )}
            {tx._source === "privatbank" && (
              <View className="bg-brand-100 rounded-full px-1.5 py-0.5 mr-1.5">
                <Text className="text-[10px] font-semibold text-brand-700">
                  П24
                </Text>
              </View>
            )}
            <Text className="text-xs text-fg-muted">
              · {fmtDate(tx.time ?? 0)}
            </Text>
          </View>
        </View>
      </View>

      <View className="items-end">
        <Text
          className={cx(
            "text-sm font-semibold",
            tx.amount > 0 ? "text-brand-700" : "text-fg",
          )}
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {hideAmount ? "••••" : fmtAmt(tx.amount, CURRENCY.UAH)}
        </Text>
        {tx.currencyCode !== CURRENCY.UAH && tx.operationAmount && (
          <Text
            className="text-[10px] text-fg-subtle"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {hideAmount ? "••••" : fmtAmt(tx.operationAmount, tx.currencyCode)}
          </Text>
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          tx.description ? `Транзакція: ${tx.description}` : "Транзакція"
        }
        testID={testID}
      >
        {body}
      </Pressable>
    );
  }

  return body;
}

export const TxRow = memo(TxRowImpl);
