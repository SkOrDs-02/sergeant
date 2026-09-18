import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Subscription } from "@/modules/finyk/lib/budgetsStore";

export interface SubscriptionRowProps {
  subscription: Subscription;
  /**
   * Whole days until the **next** charge. Always >= 0 — callers must
   * roll the billing day forward to next month when it has already
   * passed in the current one.
   */
  daysToNext: number | null;
  /** Date string for the next charge (locale-formatted). */
  nextChargeLabel: string | null;
  amountLabel: string | null;
  onPress: () => void;
  testID?: string;
}

function SubscriptionRowImpl({
  subscription,
  daysToNext,
  nextChargeLabel,
  amountLabel,
  onPress,
  testID,
}: SubscriptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Редагувати ${subscription.name}`}
      testID={testID}
      className="flex-row items-center px-3 py-3 border-b border-cream-200"
    >
      <Text className="text-xl mr-3">{subscription.emoji || "📦"}</Text>
      <View className="flex-1 min-w-0">
        <Text className="text-sm font-semibold text-fg" numberOfLines={1}>
          {subscription.name}
        </Text>
        <Text className="text-xs text-fg-muted" numberOfLines={1}>
          {amountLabel ?? `${subscription.currency || "UAH"}`} · день{" "}
          {subscription.billingDay}
        </Text>
        {nextChargeLabel ? (
          <Text
            className="text-[11px] text-fg-subtle"
            numberOfLines={1}
            testID={testID ? `${testID}-next-date` : undefined}
          >
            наступне списання · {nextChargeLabel}
          </Text>
        ) : null}
      </View>
      {daysToNext !== null && daysToNext >= 0 ? (
        <View
          className={
            daysToNext <= 3
              ? "rounded-full bg-amber-100 px-2 py-0.5"
              : "rounded-full bg-cream-100 px-2 py-0.5"
          }
        >
          <Text
            className={
              daysToNext <= 3
                ? "text-[11px] font-medium text-amber-800"
                : "text-[11px] font-medium text-fg-muted"
            }
          >
            {daysToNext === 0 ? "сьогодні" : `за ${daysToNext} дн.`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const SubscriptionRow = memo(SubscriptionRowImpl);
