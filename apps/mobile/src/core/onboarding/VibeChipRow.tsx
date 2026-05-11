/**
 * Mobile port of the web `VibeChipRow` rendered inside
 * `apps/web/src/core/OnboardingWizard.tsx`. Keeps the same two-column
 * grid, the same inline teaser copy and the same `aria-pressed`-style
 * selected state — just expressed with `Pressable` + NativeWind.
 *
 * Module taxonomy (icons, labels, teasers) comes from
 * `@sergeant/shared/lib/onboarding` so web and mobile can't drift.
 * Web renders Lucide icons keyed by the shared icon name; mobile uses
 * the same emoji glyphs already shown in the tab bar and the hub
 * StatusRow — no new runtime dep.
 */

import { Pressable, Text, View } from "react-native";

import {
  DASHBOARD_MODULE_LABELS,
  ONBOARDING_VIBE_CHIP_ORDER,
  ONBOARDING_VIBE_TEASERS,
  hapticTap,
  type DashboardModuleId,
} from "@sergeant/shared";

import { CHIP_GLYPH, cx } from "./style";

export interface VibeChipRowProps {
  picks: readonly DashboardModuleId[];
  togglePick: (id: DashboardModuleId) => void;
}

export function VibeChipRow({ picks, togglePick }: VibeChipRowProps) {
  return (
    <View className="w-full gap-2">
      <Text className="text-center text-[11px] text-fg-muted">
        Зніми зайве — решту легко додати потім.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {ONBOARDING_VIBE_CHIP_ORDER.map((id) => {
          const active = picks.includes(id);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={DASHBOARD_MODULE_LABELS[id]}
              testID={`onboarding-chip-${id}`}
              onPress={() => {
                hapticTap();
                togglePick(id);
              }}
              className={cx(
                "basis-[48%] flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5",
                "active:opacity-70",
                active
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-cream-300 bg-cream-50",
              )}
            >
              <View
                className={cx(
                  "h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-brand-500/15" : "bg-cream-100",
                )}
              >
                <Text className="text-base">{CHIP_GLYPH[id]}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-sm font-semibold leading-tight text-fg"
                >
                  {DASHBOARD_MODULE_LABELS[id]}
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-[11px] leading-tight text-fg-muted"
                >
                  {ONBOARDING_VIBE_TEASERS[id]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
