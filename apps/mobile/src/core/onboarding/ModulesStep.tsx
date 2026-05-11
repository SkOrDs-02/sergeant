import { Pressable, Text, View } from "react-native";

import {
  ALL_MODULES,
  DASHBOARD_MODULE_LABELS,
  hapticTap,
  ONBOARDING_MODULE_DESCRIPTIONS,
  ONBOARDING_VIBE_TEASERS,
  type DashboardModuleId,
  type OnboardingDefaultPicksVariant,
} from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

import { CHIP_GLYPH, cx } from "./style";

export function ModulesStep({
  picks,
  togglePick,
  onContinue,
  onBack,
  defaultPicksVariant,
}: {
  picks: DashboardModuleId[];
  togglePick: (id: DashboardModuleId) => void;
  onContinue: () => void;
  onBack: () => void;
  /**
   * S6.1: `none` arm disables «Далі» on empty picks and switches the
   * inline hint to «Обери хоч один модуль». `all` arm keeps the
   * pre-S6.1 «Без вибору — всі 4 модулі» fallback message.
   */
  defaultPicksVariant: OnboardingDefaultPicksVariant;
}) {
  const ctaDisabled = defaultPicksVariant === "none" && picks.length === 0;
  return (
    <View className="items-center gap-4">
      <View className="items-center gap-1">
        <Text className="text-center text-xl font-bold text-fg">
          Що тобі важливо?
        </Text>
        <Text className="text-center text-xs text-fg-muted">
          Обери модулі — решту легко додати потім.
        </Text>
      </View>
      <View className="w-full gap-2">
        {ALL_MODULES.map((id) => {
          const active = picks.includes(id);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={DASHBOARD_MODULE_LABELS[id]}
              testID={`onboarding-module-${id}`}
              onPress={() => {
                hapticTap();
                togglePick(id);
              }}
              className={cx(
                "w-full flex-row items-start gap-3 rounded-2xl border p-3.5",
                "active:opacity-70",
                active
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-cream-300 bg-cream-50",
              )}
            >
              {active && (
                <View className="absolute right-2.5 top-2.5 h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                  <Text className="text-xs text-white">✓</Text>
                </View>
              )}
              <View
                className={cx(
                  "h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  active ? "bg-brand-500/15" : "bg-cream-100",
                )}
              >
                <Text className="text-lg">{CHIP_GLYPH[id]}</Text>
              </View>
              <View className="min-w-0 flex-1 pr-4">
                <Text className="text-sm font-bold leading-tight text-fg">
                  {DASHBOARD_MODULE_LABELS[id]}
                </Text>
                <Text className="mt-0.5 text-xs leading-snug text-fg-muted">
                  {ONBOARDING_MODULE_DESCRIPTIONS[id]}
                </Text>
                <Text className="mt-1 text-[11px] leading-tight text-fg-subtle">
                  {ONBOARDING_VIBE_TEASERS[id]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View className="w-full flex-row gap-2">
        <Pressable
          onPress={onBack}
          className="items-center justify-center rounded-xl px-4 py-3 active:opacity-70"
          testID="onboarding-back-modules"
        >
          <Text className="text-sm text-fg-muted">←</Text>
        </Pressable>
        <Button
          variant="primary"
          size="lg"
          onPress={onContinue}
          testID="onboarding-next-modules"
          className="flex-1"
          disabled={ctaDisabled}
        >
          Далі
        </Button>
      </View>
      {picks.length === 0 && defaultPicksVariant === "none" && (
        <Text
          accessibilityRole="text"
          accessibilityLabel="Обери хоч один модуль"
          testID="onboarding-empty-picks-hint"
          className="text-center text-[11px] text-fg-muted"
        >
          Обери хоч один модуль
        </Text>
      )}
      {picks.length === 0 && defaultPicksVariant === "all" && (
        <Text className="text-center text-[11px] text-fg-muted">
          Без вибору — всі 4 модулі.
        </Text>
      )}
    </View>
  );
}
