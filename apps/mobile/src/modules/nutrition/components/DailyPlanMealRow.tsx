/**
 * Mobile port of `apps/web/src/modules/nutrition/components/DailyPlanMealRow.tsx`.
 *
 * Display-only RN-картка для AI-згенерованого прийому з денного плану:
 * тип/іконка → назва → опис → бейджі макро + 2 CTA (журнал / замінити).
 * Інгредієнти розкриваються по тапу на «▼ Інгредієнти».
 */
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { MealTypeId } from "@sergeant/nutrition-domain";

import { SectionHeading } from "@/components/ui/SectionHeading";

import { MacroBadge } from "./DailyPlanMacros";

export interface PlanMeal {
  type?: MealTypeId | string;
  label?: string;
  name?: string;
  description?: string;
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  ingredients?: string[];
  [key: string]: unknown;
}

export const MEAL_TYPE_ORDER: readonly string[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];
export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
};
export const MEAL_TYPE_ICONS: Record<string, string> = {
  breakfast: "☀️",
  lunch: "🥗",
  dinner: "🍽️",
  snack: "🍎",
};

export interface DailyPlanMealRowProps {
  meal: PlanMeal;
  onAddToLog: (meal: PlanMeal) => void | Promise<void>;
  onRegen: (mealType: string) => void | Promise<void>;
  busy?: boolean;
  testID?: string;
}

export function DailyPlanMealRow({
  meal,
  onAddToLog,
  onRegen,
  busy,
  testID,
}: DailyPlanMealRowProps) {
  const [expanded, setExpanded] = useState(false);
  const typeKey = String(meal.type ?? "");

  return (
    <View
      testID={testID}
      className="rounded-2xl border border-line bg-panelHi px-3 py-3"
      style={{ gap: 8 }}
    >
      <View className="flex-row items-start" style={{ gap: 8 }}>
        <View className="flex-1" style={{ gap: 2 }}>
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text className="text-base leading-none" aria-hidden>
              {MEAL_TYPE_ICONS[typeKey] ?? "🍴"}
            </Text>
            <SectionHeading size="xs" variant="nutrition">
              {MEAL_TYPE_LABELS[typeKey] ?? meal.label ?? ""}
            </SectionHeading>
          </View>
          <Text className="text-sm font-semibold text-fg leading-tight">
            {meal.name ?? ""}
          </Text>
          {meal.description ? (
            <Text className="text-xs text-fg-muted leading-snug">
              {meal.description}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap" style={{ gap: 4 }}>
            <MacroBadge
              label="ккал"
              value={meal.kcal}
              unit=""
              containerClassName="bg-nutrition/10 border border-nutrition/20"
            />
            <MacroBadge label="Б" value={meal.protein_g} />
            <MacroBadge label="Ж" value={meal.fat_g} />
            <MacroBadge label="В" value={meal.carbs_g} />
          </View>
        </View>
        <View className="items-end" style={{ gap: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Додати в журнал"
            disabled={busy}
            onPress={() => {
              void onAddToLog(meal);
            }}
            testID={testID ? `${testID}-add` : undefined}
            className="rounded-xl border border-line bg-panel px-3 py-1.5"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-xs font-semibold text-fg">+ Журнал</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Замінити прийом"
            disabled={busy}
            onPress={() => {
              void onRegen(typeKey);
            }}
            testID={testID ? `${testID}-regen` : undefined}
            className="rounded-xl border border-line bg-panel px-3 py-1.5"
            style={{ opacity: busy ? 0.5 : 1 }}
          >
            <Text className="text-xs font-semibold text-fg">↻ Замінити</Text>
          </Pressable>
        </View>
      </View>
      {(meal.ingredients?.length ?? 0) > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((v) => !v)}
          testID={testID ? `${testID}-toggle-ingredients` : undefined}
          className="self-start"
        >
          <Text className="text-xs font-semibold text-nutrition-strong">
            {expanded ? "▲ Сховати інгредієнти" : "▼ Інгредієнти"}
          </Text>
        </Pressable>
      ) : null}
      {expanded && (meal.ingredients?.length ?? 0) > 0 ? (
        <View className="pl-3" style={{ gap: 2 }}>
          {meal.ingredients!.map((ing, i) => (
            <Text key={`${ing}-${i}`} className="text-xs text-fg">
              • {ing}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
