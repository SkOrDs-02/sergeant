/**
 * Nutrition Dashboard (Сьогодні) — mobile
 * Mirror `apps/web/src/modules/nutrition/components/NutritionDashboard.tsx`
 *
 * Рендерить:
 *  - "Сьогодні" Card: лічильник прийомів + 4 macro-ring / 4 macro-tile
 *  - "+ Додати" CTA → opens AddMealSheet (PR-5)
 *  - "Тиждень · ккал" Card: 7-денна mini-bar-chart
 *  - WaterTrackerCard
 *
 * Не входить у цей PR (відкладено):
 *  - Кнопка "Налаштувати денні цілі КБЖВ" (settings screen → PR-7)
 *  - AI-підказка дня (PR-8)
 */
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import {
  getDayMacros,
  getDaySummary,
  getMacrosForDateRange,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { hapticTap, toLocalISODate, type Macros } from "@sergeant/shared";

import { Card } from "@/components/ui/Card";

import { AddMealSheet, type MealSavePayload } from "../components/AddMealSheet";
import { MacroRing } from "../components/MacroRing";
import { WaterTrackerCard } from "../components/WaterTrackerCard";
import { WeekKcalChart } from "../components/WeekKcalChart";
import { useNutritionLog } from "../hooks/useNutritionLog";
import { useNutritionPrefs } from "../hooks/useNutritionPrefs";

type MacroKey = "kcal" | "protein_g" | "fat_g" | "carbs_g";

interface MacroDef {
  key: MacroKey;
  label: string;
  color: string;
  prefKey: keyof NutritionPrefs;
  unit: string;
}

const MACRO_DEFS: readonly MacroDef[] = [
  {
    key: "kcal",
    label: "Ккал",
    color: "#f97316",
    prefKey: "dailyTargetKcal",
    unit: "",
  },
  {
    key: "protein_g",
    label: "Білки",
    color: "#3b82f6",
    prefKey: "dailyTargetProtein_g",
    unit: "г",
  },
  {
    key: "fat_g",
    label: "Жири",
    color: "#eab308",
    prefKey: "dailyTargetFat_g",
    unit: "г",
  },
  {
    key: "carbs_g",
    label: "Вуглев.",
    color: "#22c55e",
    prefKey: "dailyTargetCarbs_g",
    unit: "г",
  },
] as const;

function mealCountLabel(count: number): string {
  if (count === 1) return "прийом";
  if (count >= 2 && count <= 4) return "прийоми";
  return "прийомів";
}

export interface DashboardProps {
  testID?: string;
  onMealAdded?: () => void;
}

export function Dashboard({ testID, onMealAdded }: DashboardProps) {
  const { nutritionLog, addMeal } = useNutritionLog();
  const { prefs } = useNutritionPrefs();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleSave = useCallback(
    (payload: MealSavePayload) => {
      addMeal(toLocalISODate(new Date()), payload);
      setSheetOpen(false);
      onMealAdded?.();
    },
    [addMeal, onMealAdded],
  );

  const today = toLocalISODate(new Date());

  const macros: Macros = useMemo(
    () => getDayMacros(nutritionLog, today),
    [nutritionLog, today],
  );
  const summary = useMemo(
    () => getDaySummary(nutritionLog, today),
    [nutritionLog, today],
  );
  const weekRows = useMemo(
    () => getMacrosForDateRange(nutritionLog, today, 7),
    [nutritionLog, today],
  );

  const hasTargets =
    (prefs.dailyTargetKcal || 0) > 0 ||
    (prefs.dailyTargetProtein_g || 0) > 0 ||
    (prefs.dailyTargetFat_g || 0) > 0 ||
    (prefs.dailyTargetCarbs_g || 0) > 0;

  return (
    <ScrollView
      testID={testID}
      className="flex-1 bg-bg dark:bg-bg"
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Card testID="nutrition-today-card">
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-sm font-semibold text-fg leading-none">
              Сьогодні
            </Text>
            <Text className="text-xs text-fg-muted mt-1">
              {summary.mealCount} {mealCountLabel(summary.mealCount)} їжі
            </Text>
          </View>
          <Pressable
            onPress={() => setSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Додати прийом їжі"
            testID="nutrition-add-meal-btn"
            className="bg-lime-600 rounded-full px-3 py-1.5"
          >
            <Text className="text-xs font-bold text-white">+ Додати</Text>
          </Pressable>
        </View>

        {hasTargets ? (
          <View className="flex-row justify-around">
            {MACRO_DEFS.map((m) => (
              <MacroRing
                key={m.key}
                value={macros[m.key] || 0}
                target={Number(prefs[m.prefKey]) || 0}
                color={m.color}
                label={m.label}
                unit={m.unit}
              />
            ))}
          </View>
        ) : (
          <View className="flex-row gap-2">
            {MACRO_DEFS.map((m) => (
              <View
                key={m.key}
                className="flex-1 rounded-xl border border-lime-500/20 bg-lime-500/10 px-2 py-2.5 items-center"
              >
                <Text className="text-[10px] font-bold uppercase text-lime-700 leading-none mb-1">
                  {m.label}
                </Text>
                <Text className="text-sm font-extrabold text-fg leading-none">
                  {Math.round(macros[m.key] || 0)}
                  {m.unit ? ` ${m.unit}` : ""}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Card testID="nutrition-week-card">
        <Text className="text-sm font-semibold text-fg mb-2 leading-none">
          Тиждень · ккал
        </Text>
        <WeekKcalChart
          rows={weekRows}
          targetKcal={prefs.dailyTargetKcal || 0}
          todayIso={today}
        />
      </Card>

      <Card testID="nutrition-pantry-cta">
        <Pressable
          onPress={() => {
            hapticTap();
            router.push("/(tabs)/nutrition/pantry");
          }}
          accessibilityRole="button"
          accessibilityLabel="Відкрити комору"
          className="flex-row items-center justify-between"
        >
          <View>
            <Text className="text-sm font-semibold text-fg">Комора</Text>
            <Text className="text-xs text-fg-muted mt-0.5">
              Склад продуктів (кілька комор)
            </Text>
          </View>
          <Text className="text-fg-subtle text-lg" aria-hidden>
            ›
          </Text>
        </Pressable>
      </Card>

      <Card testID="nutrition-saved-recipes-cta">
        <Pressable
          onPress={() => {
            hapticTap();
            router.push("/(tabs)/nutrition/saved-recipes");
          }}
          accessibilityRole="button"
          accessibilityLabel="Збережені рецепти"
          className="flex-row items-center justify-between"
        >
          <View>
            <Text className="text-sm font-semibold text-fg">
              Збережені рецепти
            </Text>
            <Text className="text-xs text-fg-muted mt-0.5">
              Локальна книга, імпорт з web (JSON)
            </Text>
          </View>
          <Text className="text-fg-subtle text-lg" aria-hidden>
            ›
          </Text>
        </Pressable>
      </Card>

      <WaterTrackerCard
        goalMl={prefs.waterGoalMl ?? 2000}
        testID="nutrition-water-card"
      />

      <AddMealSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleSave}
      />
    </ScrollView>
  );
}
