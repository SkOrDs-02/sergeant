/**
 * Mobile port of `apps/web/src/modules/nutrition/components/DailyPlanMacros.tsx`.
 *
 * Не імпортує DOM-only utility (`@shared/lib/ui/cn`). Натомість тримає
 * базові className-рядки інлайн або через template literals, що цілком
 * сумісно з NativeWind. `chartHex` — спільний токен дизайн-системи.
 */
import { Text, View } from "react-native";

import { chartHex } from "@sergeant/design-tokens/tokens";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";

import { SectionHeading } from "@/components/ui/SectionHeading";

export function MacroRatioBar({ prefs }: { prefs: NutritionPrefs }) {
  const prot = prefs.dailyTargetProtein_g ?? 0;
  const fat = prefs.dailyTargetFat_g ?? 0;
  const carb = prefs.dailyTargetCarbs_g ?? 0;
  if (!(prot > 0) && !(fat > 0) && !(carb > 0)) return null;

  const protKcal = prot * 4;
  const fatKcal = fat * 9;
  const carbKcal = carb * 4;
  const total = protKcal + fatKcal + carbKcal || 1;

  const pctP = Math.round((protKcal / total) * 100);
  const pctF = Math.round((fatKcal / total) * 100);
  const pctC = 100 - pctP - pctF;

  return (
    <View
      className="mt-3"
      style={{ gap: 6 }}
      testID="daily-plan-macro-ratio-bar"
    >
      <SectionHeading size="xs" variant="muted">
        Відсоткове співвідношення макро
      </SectionHeading>
      <View
        className="rounded-xl overflow-hidden flex-row"
        style={{ height: 20 }}
      >
        {pctP > 0 && (
          <View
            className="items-center justify-center"
            style={{ width: `${pctP}%`, backgroundColor: chartHex.protein }}
          >
            <Text className="text-[10px] font-bold text-white">{pctP}%</Text>
          </View>
        )}
        {pctF > 0 && (
          <View
            className="items-center justify-center"
            style={{ width: `${pctF}%`, backgroundColor: chartHex.fat }}
          >
            <Text className="text-[10px] font-bold text-white">{pctF}%</Text>
          </View>
        )}
        {pctC > 0 && (
          <View
            className="items-center justify-center"
            style={{ width: `${pctC}%`, backgroundColor: chartHex.carbs }}
          >
            <Text className="text-[10px] font-bold text-white">{pctC}%</Text>
          </View>
        )}
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <View
            className="rounded-sm"
            style={{ width: 8, height: 8, backgroundColor: chartHex.protein }}
          />
          <Text className="text-[10px] text-fg-muted">
            Б {pctP}% · {prot}г · {Math.round(protKcal)} ккал
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <View
            className="rounded-sm"
            style={{ width: 8, height: 8, backgroundColor: chartHex.fat }}
          />
          <Text className="text-[10px] text-fg-muted">
            Ж {pctF}% · {fat}г · {Math.round(fatKcal)} ккал
          </Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <View
            className="rounded-sm"
            style={{ width: 8, height: 8, backgroundColor: chartHex.carbs }}
          />
          <Text className="text-[10px] text-fg-muted">
            В {pctC}% · {carb}г · {Math.round(carbKcal)} ккал
          </Text>
        </View>
      </View>
    </View>
  );
}

interface MacroBadgeProps {
  label: string;
  value: number | null | undefined;
  unit?: string;
  /**
   * Optional NativeWind class overrides for the container (background +
   * border). Defaults to a neutral panel-tinted pill — pass a custom
   * value for the kcal accent badge.
   */
  containerClassName?: string;
}

export function MacroBadge({
  label,
  value,
  unit = "г",
  containerClassName,
}: MacroBadgeProps) {
  if (value == null) return null;
  const container = containerClassName ?? "bg-panelHi border border-line";
  return (
    <View
      className={`flex-row items-center rounded-xl px-2 py-0.5 ${container}`}
      style={{ gap: 4 }}
    >
      <Text className="text-xs font-semibold text-fg">{Math.round(value)}</Text>
      <Text className="text-xs text-fg-muted">{unit}</Text>
      <Text className="text-xs text-fg-subtle">{label}</Text>
    </View>
  );
}
