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

import { isApiError } from "@sergeant/api-client";
import { useApiClient } from "@sergeant/api-client/react";
import {
  getDayMacros,
  getDaySummary,
  getMacrosForDateRange,
  type MealTypeId,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { hapticTap, toLocalISODate, type Macros } from "@sergeant/shared";

import { Card } from "@/components/ui/Card";

import { AddMealSheet, type MealSavePayload } from "../components/AddMealSheet";
import { DailyPlanCard } from "../components/DailyPlanCard";
import { type PlanMeal } from "../components/DailyPlanMealRow";
import { MacroRing } from "../components/MacroRing";
import { WaterTrackerCard } from "../components/WaterTrackerCard";
import { WeekKcalChart } from "../components/WeekKcalChart";
import { useNutritionLog } from "../hooks/useNutritionLog";
import { useNutritionPantries } from "../hooks/useNutritionPantries";
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

/** Максимум pantry-items у промпт денного плану (паритет із web
 * `useNutritionRemoteActions.dayPlanMutation`). */
const PANTRY_ITEMS_LIMIT = 50;

/** Локальний стан AI-плану дня. Дзеркало `NutritionDayPlan` з web
 * `useNutritionUiState` — `meals` зберігаємо як `PlanMeal[]`, бо саме цей
 * тип очікує `DailyPlanCard`/`DailyPlanMealRow`. */
interface DayPlanState {
  meals: PlanMeal[];
  totalKcal?: number | null;
  totalProtein_g?: number | null;
  totalFat_g?: number | null;
  totalCarbs_g?: number | null;
  note?: string;
}

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
};

function formatDayPlanError(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 402 || e.status === 429) {
      return "Перевищено AI-квоту. Спробуй пізніше.";
    }
    if (e.kind === "network") {
      return "Немає звʼязку. Перевір інтернет і спробуй ще раз.";
    }
    return e.message || `Помилка ${e.status}`;
  }
  if (e instanceof Error) return e.message;
  return "Помилка генерації плану.";
}

/** Перерахунок сумарних макро після часткової заміни одного прийому —
 * паритет із web `dayPlanMutation.onSuccess` (merge-гілка). */
function sumMealTotals(meals: readonly PlanMeal[]): {
  totalKcal: number;
  totalProtein_g: number;
  totalFat_g: number;
  totalCarbs_g: number;
} {
  return meals.reduce(
    (acc, m) => ({
      totalKcal: acc.totalKcal + (m.kcal ?? 0),
      totalProtein_g: acc.totalProtein_g + (m.protein_g ?? 0),
      totalFat_g: acc.totalFat_g + (m.fat_g ?? 0),
      totalCarbs_g: acc.totalCarbs_g + (m.carbs_g ?? 0),
    }),
    { totalKcal: 0, totalProtein_g: 0, totalFat_g: 0, totalCarbs_g: 0 },
  );
}

export interface DashboardProps {
  testID?: string;
  onMealAdded?: () => void;
}

export function Dashboard({ testID, onMealAdded }: DashboardProps) {
  const api = useApiClient();
  const { nutritionLog, addMeal } = useNutritionLog();
  const { prefs, updatePrefs } = useNutritionPrefs();
  const { activePantry } = useNutritionPantries();
  const [sheetOpen, setSheetOpen] = useState(false);

  const [dayPlan, setDayPlan] = useState<DayPlanState | null>(null);
  const [dayPlanBusy, setDayPlanBusy] = useState(false);
  const [dayPlanErr, setDayPlanErr] = useState("");

  const handleSave = useCallback(
    (payload: MealSavePayload) => {
      addMeal(toLocalISODate(new Date()), payload);
      setSheetOpen(false);
      onMealAdded?.();
    },
    [addMeal, onMealAdded],
  );

  const today = toLocalISODate(new Date());

  // AI-генерація денного плану. Дзеркало web
  // `useNutritionRemoteActions.dayPlanMutation`: pantry (≤50) + цілі КБЖВ
  // як таргети. `regenerateMealType` → часткова заміна одного прийому;
  // без нього — повна (пере)генерація плану.
  const fetchDayPlan = useCallback(
    async (regenerateMealType?: string | null) => {
      if (dayPlanBusy) return;
      setDayPlanBusy(true);
      setDayPlanErr("");
      try {
        const pantryItems = Array.isArray(activePantry?.items)
          ? activePantry.items.slice(0, PANTRY_ITEMS_LIMIT)
          : [];
        const data = await api.nutrition.dayPlan({
          pantry: pantryItems,
          targets: {
            kcal: prefs.dailyTargetKcal ?? null,
            protein_g: prefs.dailyTargetProtein_g ?? null,
            fat_g: prefs.dailyTargetFat_g ?? null,
            carbs_g: prefs.dailyTargetCarbs_g ?? null,
          },
          ...(regenerateMealType ? { regenerateMealType } : {}),
          locale: "uk-UA",
        });
        const plan = data?.plan;
        if (!plan) throw new Error("Не вдалося отримати план харчування");
        const incoming: PlanMeal[] = Array.isArray(plan.meals)
          ? (plan.meals as PlanMeal[])
          : [];
        setDayPlan((prev) => {
          // Часткова заміна: лишаємо інші прийоми, підставляємо новий лише
          // для regenerateMealType (паритет із web merge-гілкою).
          if (regenerateMealType && prev && prev.meals.length > 0) {
            const merged: PlanMeal[] = [
              ...prev.meals.filter(
                (m) => String(m.type ?? "") !== regenerateMealType,
              ),
              ...incoming.filter(
                (m) => String(m.type ?? "") === regenerateMealType,
              ),
            ];
            return { ...prev, meals: merged, ...sumMealTotals(merged) };
          }
          return {
            meals: incoming,
            totalKcal: plan.totalKcal,
            totalProtein_g: plan.totalProtein_g,
            totalFat_g: plan.totalFat_g,
            totalCarbs_g: plan.totalCarbs_g,
            note: plan.note,
          };
        });
        hapticTap();
      } catch (e) {
        setDayPlanErr(formatDayPlanError(e));
      } finally {
        setDayPlanBusy(false);
      }
    },
    [
      api,
      activePantry?.items,
      dayPlanBusy,
      prefs.dailyTargetKcal,
      prefs.dailyTargetProtein_g,
      prefs.dailyTargetFat_g,
      prefs.dailyTargetCarbs_g,
    ],
  );

  const handleFetchDayPlan = useCallback(() => {
    void fetchDayPlan();
  }, [fetchDayPlan]);

  const handleRegenMeal = useCallback(
    (mealType: string) => {
      void fetchDayPlan(mealType);
    },
    [fetchDayPlan],
  );

  // Локальний (без мережі) додаток прийому з плану в журнал — паритет
  // із web `addMealFromPlan`. Час ставимо лише для "сьогодні".
  const handleAddMealToLog = useCallback(
    (meal: PlanMeal) => {
      const now = new Date();
      const id = `meal_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`;
      const mealType = (meal.type ?? "snack") as MealTypeId;
      const label =
        (meal.type ? MEAL_TYPE_LABELS[String(meal.type)] : undefined) ??
        meal.label ??
        "Прийом їжі";
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}`;
      addMeal(today, {
        id,
        time,
        mealType,
        label,
        name: meal.name || "Страва",
        macros: {
          kcal: meal.kcal ?? null,
          protein_g: meal.protein_g ?? null,
          fat_g: meal.fat_g ?? null,
          carbs_g: meal.carbs_g ?? null,
        },
        source: "manual",
        macroSource: "recipeAI",
      });
      hapticTap();
      onMealAdded?.();
    },
    [addMeal, onMealAdded, today],
  );

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

      <View style={{ gap: 8 }}>
        <DailyPlanCard
          prefs={prefs}
          updatePrefs={updatePrefs}
          nutritionLog={nutritionLog}
          selectedDate={today}
          dayPlan={dayPlan}
          dayPlanBusy={dayPlanBusy}
          onFetchDayPlan={handleFetchDayPlan}
          onRegenMeal={handleRegenMeal}
          onAddMealToLog={handleAddMealToLog}
          testID="nutrition-daily-plan-card"
        />
        {dayPlanErr ? (
          <Text
            className="text-xs text-danger px-1"
            testID="nutrition-daily-plan-error"
          >
            {dayPlanErr}
          </Text>
        ) : null}
      </View>

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
