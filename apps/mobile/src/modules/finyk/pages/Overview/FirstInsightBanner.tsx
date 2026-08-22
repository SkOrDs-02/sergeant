/**
 * FirstInsightBanner — one-shot hint shown once users first see Overview
 * with real data. Mobile port of
 * `apps/web/src/modules/finyk/pages/overview/FirstInsightBanner.tsx`.
 *
 * Pure presentation — parent owns `shown` / `onDismiss` / `onSetBudget`.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

export interface FirstInsightBannerProps {
  onSetBudget: () => void;
  onDismiss: () => void;
}

const FirstInsightBannerImpl = function FirstInsightBanner({
  onSetBudget,
  onDismiss,
}: FirstInsightBannerProps) {
  return (
    <View
      className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex-row items-start gap-3"
      testID="finyk-overview-first-insight"
    >
      <View className="w-10 h-10 rounded-2xl bg-emerald-100 items-center justify-center">
        <Text className="text-xl">💡</Text>
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-fg">
          Ось куди йдуть твої гроші
        </Text>
        <Text className="text-xs text-fg-muted mt-0.5">
          Хочеш поставити бюджет, і бачити, коли починаєш виходити за рамки?
        </Text>
        <View className="flex-row gap-2 mt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Поставити бюджет"
            onPress={onSetBudget}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 active:opacity-80"
          >
            <Text className="text-xs font-semibold text-white">
              Поставити бюджет
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Пізніше"
            onPress={onDismiss}
            className="px-3 py-1.5 rounded-xl active:opacity-60"
          >
            <Text className="text-xs text-fg-muted">Пізніше</Text>
          </Pressable>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрити підказку"
        onPress={onDismiss}
        className="w-8 h-8 items-center justify-center active:opacity-60"
      >
        <Text className="text-fg-subtle text-lg">×</Text>
      </Pressable>
    </View>
  );
};

export const FirstInsightBanner = memo(FirstInsightBannerImpl);
