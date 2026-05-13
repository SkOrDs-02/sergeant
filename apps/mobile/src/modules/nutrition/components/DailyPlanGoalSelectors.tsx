/**
 * Mobile port of `apps/web/src/modules/nutrition/components/DailyPlanGoalSelectors.tsx`.
 *
 * Скорочений варіант для RN:
 * - Web рендерить два меню: «Підставити пресет» (cutting/maintenance/
 *   bulking) і «Розрахувати з профілю» (Mifflin-St Jeor через
 *   біометрію). У mobile зараз немає хука біометрії (`useBiometrics`
 *   живе в `apps/web/src/core/profile`), тож TDEE-меню залишаємо
 *   до окремої міграції біометрії в RN.
 * - Презети рендеримо як 3 chip-кнопки в один ряд (натуральніший
 *   mobile-pattern, ніж dropdown), кожен onPress пише в MMKV через
 *   переданий `setPrefs` (той самий контракт, що web).
 */
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { hapticTap } from "@sergeant/shared";

import { SectionHeading } from "@/components/ui/SectionHeading";

export type UpdatePrefs = (patch: Partial<NutritionPrefs>) => void;

interface Preset {
  id: string;
  label: string;
  hint: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "cutting",
    label: "Схуднення",
    hint: "1500 ккал · Б110/Ж45/В165",
    kcal: 1500,
    protein_g: 110,
    fat_g: 45,
    carbs_g: 165,
  },
  {
    id: "maintenance",
    label: "Підтримка",
    hint: "2000 ккал · Б130/Ж65/В230",
    kcal: 2000,
    protein_g: 130,
    fat_g: 65,
    carbs_g: 230,
  },
  {
    id: "bulking",
    label: "Набір",
    hint: "2700 ккал · Б165/Ж80/В350",
    kcal: 2700,
    protein_g: 165,
    fat_g: 80,
    carbs_g: 350,
  },
];

interface DailyPlanGoalSelectorsProps {
  updatePrefs: UpdatePrefs;
  busy?: boolean;
}

export function DailyPlanGoalSelectors({
  updatePrefs,
  busy,
}: DailyPlanGoalSelectorsProps) {
  const applyPreset = useCallback(
    (preset: Preset) => {
      hapticTap();
      updatePrefs({
        dailyTargetKcal: preset.kcal,
        dailyTargetProtein_g: preset.protein_g,
        dailyTargetFat_g: preset.fat_g,
        dailyTargetCarbs_g: preset.carbs_g,
      });
    },
    [updatePrefs],
  );

  return (
    <View className="mt-2" style={{ gap: 6 }} testID="daily-plan-goal-presets">
      <SectionHeading size="xs" variant="muted">
        Швидкий пресет
      </SectionHeading>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            accessibilityRole="button"
            accessibilityLabel={`Пресет ${preset.label}: ${preset.hint}`}
            disabled={busy}
            onPress={() => applyPreset(preset)}
            testID={`daily-plan-goal-preset-${preset.id}`}
            className="flex-1 rounded-xl border border-line bg-panel px-3 py-2"
            style={{ minWidth: 100, opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-sm font-semibold text-fg">
              {preset.label}
            </Text>
            <Text className="text-[10px] text-fg-muted mt-0.5">
              {preset.hint}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
