/**
 * Finyk — Assets row components (React Native).
 *
 * One file, three sibling rows (AccountRow / ManualAssetRow / DebtRow /
 * ReceivableRow) so they can share the row chrome (radius, border,
 * press feedback, typography). Every row is a thin presentational
 * component — all math runs in `@sergeant/finyk-domain/domain/assets`.
 */

import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  calcDebtRemaining,
  calcReceivableRemaining,
  getAccountCurrencySymbol,
  getManualAssetCurrencySymbol,
  type AssetsDebt,
  type AssetsReceivable,
  type ManualAsset,
  type MonoAccount,
  type Transaction,
} from "@sergeant/finyk-domain/domain";

// Mirrors `getAccountShortName` from `apps/web/src/modules/finyk/components/TxRow.tsx`.
// The label is purely cosmetic — the domain layer treats accounts by id —
// so we keep it local to the mobile row until the web helper is promoted
// to the shared domain package.
const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  white: "⬜ Біла картка",
  black: "🖤 Кредитна картка",
  platinum: "💳 Platinum",
  iron: "🪙 Iron",
  yellow: "💛 Жовта",
  fop: "🧾 ФОП",
};

function getAccountLabel(account: MonoAccount): string {
  const label = account.type ? ACCOUNT_TYPE_LABEL[account.type] : undefined;
  if (label) {
    return label;
  }
  return account.type || "Рахунок";
}

function fmtMajor(uah: number): string {
  return uah.toLocaleString("uk-UA", { maximumFractionDigits: 2 });
}

function fmtKop(amountKop: number): string {
  return (amountKop / 100).toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
  });
}

interface BaseRowProps {
  testID?: string;
}

export interface AccountRowProps extends BaseRowProps {
  account: MonoAccount;
}

export const AccountRow = memo(function AccountRow({
  account,
  testID,
}: AccountRowProps) {
  const symbol = getAccountCurrencySymbol(account.currencyCode ?? null);
  return (
    <View
      className="flex-row items-center justify-between py-2.5 px-1 border-b border-cream-200 last:border-b-0"
      testID={testID}
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        <Text className="text-xl">💳</Text>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-fg" numberOfLines={1}>
            {getAccountLabel(account)}
          </Text>
          <Text className="text-xs text-fg-muted mt-0.5">
            {fmtKop(account.balance ?? 0)} {symbol}
          </Text>
        </View>
      </View>
    </View>
  );
});

export interface ManualAssetRowProps extends BaseRowProps {
  asset: ManualAsset;
  onPress: () => void;
}

export const ManualAssetRow = memo(function ManualAssetRow({
  asset,
  onPress,
  testID,
}: ManualAssetRowProps) {
  const symbol = getManualAssetCurrencySymbol(asset.currency);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Редагувати ${asset.name}`}
      testID={testID}
      className="flex-row items-center justify-between py-2.5 px-1 border-b border-cream-200 last:border-b-0"
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        <Text className="text-xl">{asset.emoji || "💰"}</Text>
        <Text className="text-sm font-medium text-fg flex-1" numberOfLines={1}>
          {asset.name}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-fg">
        {fmtMajor(asset.amount)} {symbol}
      </Text>
    </Pressable>
  );
});

export interface DebtRowProps extends BaseRowProps {
  debt: AssetsDebt;
  transactions: readonly Transaction[];
  onPress: () => void;
}

export const DebtRow = memo(function DebtRow({
  debt,
  transactions,
  onPress,
  testID,
}: DebtRowProps) {
  const remaining = calcDebtRemaining(debt, transactions as Transaction[]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Редагувати борг ${debt.name ?? ""}`}
      testID={testID}
      className="flex-row items-center justify-between py-2.5 px-1 border-b border-cream-200 last:border-b-0"
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        <Text className="text-xl">{debt.emoji || "💸"}</Text>
        <Text className="text-sm font-medium text-fg flex-1" numberOfLines={1}>
          {debt.name || "Борг"}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-rose-600">
        −{fmtMajor(remaining)} ₴
      </Text>
    </Pressable>
  );
});

export interface ReceivableRowProps extends BaseRowProps {
  receivable: AssetsReceivable;
  transactions: readonly Transaction[];
  onPress: () => void;
}

export const ReceivableRow = memo(function ReceivableRow({
  receivable,
  transactions,
  onPress,
  testID,
}: ReceivableRowProps) {
  const remaining = calcReceivableRemaining(
    receivable,
    transactions as Transaction[],
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Редагувати дебіторку ${receivable.name ?? ""}`}
      testID={testID}
      className="flex-row items-center justify-between py-2.5 px-1 border-b border-cream-200 last:border-b-0"
    >
      <View className="flex-row items-center gap-3 min-w-0 flex-1">
        <Text className="text-xl">{receivable.emoji || "👤"}</Text>
        <Text className="text-sm font-medium text-fg flex-1" numberOfLines={1}>
          {receivable.name || "Дебіторка"}
        </Text>
      </View>
      <Text className="text-sm font-semibold text-emerald-600">
        +{fmtMajor(remaining)} ₴
      </Text>
    </Pressable>
  );
});
