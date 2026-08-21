/**
 * Mobile port of the web `SplashStep` rendered inside
 * `apps/web/src/core/OnboardingWizard.tsx`. Single-step splash: value
 * prop, vibe picker row and the primary CTA live in the same view so
 * a cold-start user spends one screen — not two — before they see
 * their populated hub.
 *
 * Parity notes:
 *  - CTA stays enabled even when the user deselects every chip; the
 *    empty-picks path is handled by `buildFinalPicks` in shared, which
 *    falls back to all four modules, and a gentle hint surfaces under
 *    the CTA.
 *  - All copy matches the web verbatim; callers own telemetry (there
 *    is no mobile analytics sink yet — Phase 6).
 */

import { Text, View } from "react-native";

import { type DashboardModuleId } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

import { VibeChipRow } from "./VibeChipRow";

export interface SplashStepProps {
  picks: readonly DashboardModuleId[];
  togglePick: (id: DashboardModuleId) => void;
  onContinue: () => void;
}

export function SplashStep({ picks, togglePick, onContinue }: SplashStepProps) {
  const hasPicks = picks.length > 0;
  return (
    <View className="items-center gap-5">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10">
        <Text className="text-4xl">✨</Text>
      </View>
      <View className="items-center">
        <Text className="text-center text-2xl font-bold text-fg">
          Твоє життя це один екран.
        </Text>
        <Text className="mt-2 text-center text-sm leading-relaxed text-fg-muted">
          Гроші, тіло, звички, їжа. Офлайн. ~5 секунд на перший запис.
        </Text>
      </View>
      <VibeChipRow picks={picks} togglePick={togglePick} />
      <View className="w-full gap-2">
        <Button
          variant="primary"
          size="lg"
          onPress={onContinue}
          testID="onboarding-finish"
          className="w-full"
        >
          Заповни мій хаб
        </Button>
        {!hasPicks ? (
          <Text className="text-center text-[11px] text-fg-muted">
            Без вибору: всі 4 модулі. Налаштуєш потім.
          </Text>
        ) : null}
      </View>
      <Text className="text-center text-[11px] leading-relaxed text-fg-subtle">
        Усе локально. Синхрон, коли сам захочеш.
      </Text>
    </View>
  );
}
