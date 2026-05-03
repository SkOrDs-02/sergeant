/**
 * Sergeant Finyk — single FlashList row for `TransactionsPage`.
 *
 * Two render branches:
 *  - day-header (label + signed total + collapse caret), tappable to
 *    flip the collapsed flag for the day;
 *  - transaction row wrapped in `SwipeToAction` (left → Edit / Bank
 *    actions, right → Categorize) and a tap-to-edit affordance for
 *    parity with the web feed.
 */
import { Pressable, Text, View } from "react-native";

import { CURRENCY, fmtAmt } from "@sergeant/finyk-domain";
import type { Transaction } from "@sergeant/finyk-domain/domain";

import { SwipeToAction } from "@/components/ui/SwipeToAction";
import { TxRow } from "@/modules/finyk/components/TxRow";

import type { FeedItem } from "../types";

interface TransactionsFeedItemProps {
  item: FeedItem;
  accounts: React.ComponentProps<typeof TxRow>["accounts"];
  customCategories: React.ComponentProps<typeof TxRow>["customCategories"];
  txSplits: React.ComponentProps<typeof TxRow>["txSplits"];
  txCategories: Record<string, string | null>;
  hiddenTxIdSet: Set<string>;
  onToggleDay: (dayKey: string) => void;
  onSwipeLeft: (tx: Transaction) => void;
  onSwipeRight: (tx: Transaction) => void;
  onPressManual: (tx: Transaction) => void;
  onPressBank: (tx: Transaction) => void;
}

export function TransactionsFeedItem({
  item,
  accounts,
  customCategories,
  txSplits,
  txCategories,
  hiddenTxIdSet,
  onToggleDay,
  onSwipeLeft,
  onSwipeRight,
  onPressManual,
  onPressBank,
}: TransactionsFeedItemProps) {
  if (item.kind === "header") {
    const sign = item.total >= 0 ? "+" : "";
    const totalText =
      item.count === 0 ? "" : `${sign}${fmtAmt(item.total, CURRENCY.UAH)}`;
    return (
      <Pressable
        onPress={() => onToggleDay(item.dayKey)}
        accessibilityRole="button"
        accessibilityState={{ expanded: !item.collapsed }}
        accessibilityLabel={`${item.collapsed ? "Розгорнути" : "Згорнути"} ${item.label}`}
        className="flex-row items-center justify-between bg-cream-100/80 px-4 py-2 border-b border-cream-300 active:opacity-70"
        testID={`finyk-tx-day-${item.key}`}
      >
        <View className="flex-row items-center flex-1 min-w-0">
          <Text
            className="text-fg-muted mr-2 text-xs"
            style={{ width: 10 }}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {item.collapsed ? "▸" : "▾"}
          </Text>
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift */}
          <Text className="text-xs font-semibold uppercase tracking-wide text-fg-muted flex-shrink">
            {item.label}
          </Text>
          {item.count > 0 ? (
            <Text className="text-[10px] font-normal text-fg-subtle ml-2">
              · {item.count}
            </Text>
          ) : null}
        </View>
        {totalText ? (
          <Text
            className={
              item.total >= 0
                ? "text-xs font-semibold text-brand-600"
                : "text-xs font-semibold text-fg"
            }
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {totalText}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  const tx = item.tx;
  const isManual = !!tx._manual;
  const overrideId = txCategories[tx.id] ?? null;
  return (
    <SwipeToAction
      onSwipeLeft={() => onSwipeLeft(tx)}
      onSwipeRight={() => onSwipeRight(tx)}
      leftLabel={isManual ? "✎ Редагувати" : "⋯ Дії"}
      leftColor="bg-brand-500"
      rightLabel="🏷 Категорія"
      rightColor="bg-warning"
    >
      <TxRow
        tx={tx}
        accounts={accounts}
        txSplits={txSplits}
        customCategories={customCategories}
        overrideCatId={overrideId}
        hidden={hiddenTxIdSet.has(tx.id)}
        onPress={isManual ? () => onPressManual(tx) : () => onPressBank(tx)}
        testID={`finyk-tx-row-${tx.id}`}
      />
    </SwipeToAction>
  );
}
