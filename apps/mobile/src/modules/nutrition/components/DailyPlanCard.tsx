/**
 * Mobile port of `apps/web/src/modules/nutrition/components/DailyPlanCard.tsx`.
 *
 * Nutrition Phase 7 (RN) — спрощений варіант web-картки, який можна
 * рендерити на Dashboard / Log:
 *  - Поле «Цілі на день» (kcal + Б/Ж/В) з автоперерахунком kcal коли
 *    він не зачеплений вручну (паритет з web рядок 161-194).
 *  - Швидкі пресети (`DailyPlanGoalSelectors`) — пишуть у MMKV через
 *    `updatePrefs` з `useNutritionPrefs`.
 *  - Попередження (`MacroKcalWarning`, `MissingMacrosHint`,
 *    `GoalRangeWarning`) з тими ж pure-функціями з
 *    `@sergeant/nutrition-domain`.
 *  - Plan-vs-actual diff: ккал у поточному журналі за обрану дату
 *    проти `dailyTargetKcal` — прогрес-бар + текстовий статус.
 *  - Бейджі макро-цілей з кнопкою «Скинути».
 *
 * Web-only функціонал, який сюди *не* портовано (буде наступним PR
 * у Phase 7):
 *  - AI-генерація денного / тижневого плану (нема mobile-хуків
 *    `useNutritionRemoteActions`).
 *  - TDEE-розрахунок з біометрії (нема `useBiometrics` у RN).
 *  - First-run hint banner (порт у окремому PR FTUX-mobile).
 */
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  getDayMacros,
  type NutritionLog,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";

import { Card, CardTitle } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

import { DailyPlanGoalSelectors } from "./DailyPlanGoalSelectors";
import { MacroBadge, MacroRatioBar } from "./DailyPlanMacros";
import {
  DailyPlanMealRow,
  MEAL_TYPE_ORDER,
  type PlanMeal,
} from "./DailyPlanMealRow";
import {
  GoalRangeWarning,
  MacroKcalWarning,
  MissingMacrosHint,
  type UpdatePrefs,
} from "./DailyPlanWarnings";

export interface DailyPlanCardProps {
  prefs: NutritionPrefs;
  /** Partial-патч у MMKV; з `useNutritionPrefs().updatePrefs`. */
  updatePrefs: UpdatePrefs;
  /** Журнал прийомів (для plan-vs-actual diff). */
  nutritionLog: NutritionLog;
  /** ISO-дата (YYYY-MM-DD), для якої рендеримо порівняння з планом. */
  selectedDate: string;
  /** Опціональний AI-згенерований план дня (web-хук подати окремим PR). */
  dayPlan?: {
    meals?: PlanMeal[];
    totalKcal?: number | null;
    note?: string;
  } | null;
  /** Optional add-to-log handler — викликається з кнопки в `DailyPlanMealRow`. */
  onAddMealToLog?: (meal: PlanMeal) => void;
  /** Optional regen handler — викликається з кнопки в `DailyPlanMealRow`. */
  onRegenMeal?: (mealType: string) => void;
  /** Optional «Згенерувати план» CTA — рендериться лише коли передано. */
  onFetchDayPlan?: () => void;
  dayPlanBusy?: boolean;
  testID?: string;
}

interface GoalInputRowProps {
  fieldKey:
    | "dailyTargetKcal"
    | "dailyTargetProtein_g"
    | "dailyTargetFat_g"
    | "dailyTargetCarbs_g";
  label: string;
  unit: string;
  prefs: NutritionPrefs;
  updatePrefs: UpdatePrefs;
  disabled?: boolean;
}

function GoalInputRow({
  fieldKey,
  label,
  unit,
  prefs,
  updatePrefs,
  disabled,
}: GoalInputRowProps) {
  const currentValue = prefs[fieldKey];
  return (
    <View className="flex-1" style={{ minWidth: 130, gap: 4 }}>
      <Text className="text-xs font-semibold text-fg-muted">
        {label}
        {unit ? ` (${unit})` : ""}
      </Text>
      <TextInput
        editable={!disabled}
        keyboardType="numeric"
        value={currentValue != null ? String(currentValue) : ""}
        placeholder="—"
        placeholderTextColor="#9ca3af"
        testID={`daily-plan-${fieldKey}`}
        onChangeText={(raw: string) => {
          const trimmed = raw.trim();
          const v =
            trimmed === ""
              ? null
              : Number(trimmed) > 0
                ? Number(trimmed)
                : null;
          // Auto-recalc kcal if user hasn't pinned it (mirrors web rows
          // 161-194 у `DailyPlanCard.tsx`).
          if (fieldKey !== "dailyTargetKcal") {
            const prevProt = prefs.dailyTargetProtein_g ?? 0;
            const prevFat = prefs.dailyTargetFat_g ?? 0;
            const prevCarb = prefs.dailyTargetCarbs_g ?? 0;
            const prevCalc = Math.round(
              prevProt * 4 + prevFat * 9 + prevCarb * 4,
            );
            const isAutoKcal =
              prefs.dailyTargetKcal == null ||
              prefs.dailyTargetKcal === prevCalc;
            const patch: Partial<NutritionPrefs> = { [fieldKey]: v };
            if (isAutoKcal) {
              const prot = fieldKey === "dailyTargetProtein_g" ? v : prevProt;
              const fat = fieldKey === "dailyTargetFat_g" ? v : prevFat;
              const carb = fieldKey === "dailyTargetCarbs_g" ? v : prevCarb;
              const calc = Math.round(
                (prot ?? 0) * 4 + (fat ?? 0) * 9 + (carb ?? 0) * 4,
              );
              patch.dailyTargetKcal = calc > 0 ? calc : null;
            }
            updatePrefs(patch);
            return;
          }
          updatePrefs({ [fieldKey]: v });
        }}
        className="rounded-xl border border-line bg-panel px-3 py-2 text-fg"
        style={{ minHeight: 44 }}
      />
    </View>
  );
}

export function DailyPlanCard({
  prefs,
  updatePrefs,
  nutritionLog,
  selectedDate,
  dayPlan,
  onAddMealToLog,
  onRegenMeal,
  onFetchDayPlan,
  dayPlanBusy,
  testID,
}: DailyPlanCardProps) {
  const [resetPending, setResetPending] = useState(false);

  const hasTargets = prefs.dailyTargetKcal != null;
  const todayMacros = getDayMacros(nutritionLog, selectedDate);
  const actualKcal = todayMacros.kcal;
  const targetKcal = prefs.dailyTargetKcal ?? 0;
  const overBudget = targetKcal > 0 && actualKcal > targetKcal * 1.1;
  const progressPct =
    targetKcal > 0
      ? Math.min(100, Math.round((actualKcal / targetKcal) * 100))
      : 0;

  const sortedMeals: PlanMeal[] = dayPlan?.meals
    ? [...dayPlan.meals].sort(
        (a, b) =>
          MEAL_TYPE_ORDER.indexOf(String(a.type ?? "")) -
          MEAL_TYPE_ORDER.indexOf(String(b.type ?? "")),
      )
    : [];

  const handleResetGoals = () => {
    if (resetPending) {
      updatePrefs({
        dailyTargetKcal: null,
        dailyTargetProtein_g: null,
        dailyTargetFat_g: null,
        dailyTargetCarbs_g: null,
      });
      setResetPending(false);
      return;
    }
    setResetPending(true);
    setTimeout(() => setResetPending(false), 3000);
  };

  return (
    <Card testID={testID ?? "daily-plan-card"} padding="md">
      <CardTitle>Денний план</CardTitle>
      <Text className="text-xs text-fg-muted mt-0.5">
        Постав цілі КБЖВ на день і слідкуй за прогресом журналу проти них.
      </Text>

      <View style={{ gap: 16, marginTop: 16 }}>
        <View style={{ gap: 12 }}>
          <SectionHeading size="xs" variant="muted">
            Цілі на день
          </SectionHeading>

          <DailyPlanGoalSelectors
            updatePrefs={updatePrefs}
            busy={dayPlanBusy}
          />

          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <GoalInputRow
              fieldKey="dailyTargetKcal"
              label="Ккал/день"
              unit=""
              prefs={prefs}
              updatePrefs={updatePrefs}
              disabled={dayPlanBusy}
            />
            <GoalInputRow
              fieldKey="dailyTargetProtein_g"
              label="Білки"
              unit="г"
              prefs={prefs}
              updatePrefs={updatePrefs}
              disabled={dayPlanBusy}
            />
            <GoalInputRow
              fieldKey="dailyTargetFat_g"
              label="Жири"
              unit="г"
              prefs={prefs}
              updatePrefs={updatePrefs}
              disabled={dayPlanBusy}
            />
            <GoalInputRow
              fieldKey="dailyTargetCarbs_g"
              label="Вуглеводи"
              unit="г"
              prefs={prefs}
              updatePrefs={updatePrefs}
              disabled={dayPlanBusy}
            />
          </View>

          <MacroRatioBar prefs={prefs} />
          <MissingMacrosHint
            prefs={prefs}
            updatePrefs={updatePrefs}
            busy={dayPlanBusy}
          />
          <MacroKcalWarning
            prefs={prefs}
            updatePrefs={updatePrefs}
            busy={dayPlanBusy}
          />
          <GoalRangeWarning prefs={prefs} />

          {hasTargets ? (
            <View
              className="flex-row flex-wrap items-center"
              style={{ gap: 4 }}
            >
              {prefs.dailyTargetKcal != null && (
                <MacroBadge
                  label="ккал"
                  value={prefs.dailyTargetKcal}
                  unit=""
                  containerClassName="bg-nutrition/10 border border-nutrition/20"
                />
              )}
              <MacroBadge label="Б" value={prefs.dailyTargetProtein_g} />
              <MacroBadge label="Ж" value={prefs.dailyTargetFat_g} />
              <MacroBadge label="В" value={prefs.dailyTargetCarbs_g} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Скинути цілі"
                onPress={handleResetGoals}
                testID="daily-plan-reset-goals"
                className="ml-auto px-2 py-1 rounded-xl"
              >
                <Text
                  className={`text-xs font-semibold ${resetPending ? "text-danger-strong" : "text-fg-muted"}`}
                >
                  {resetPending ? "Натисни ще раз" : "✕ Скинути"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {hasTargets ? (
          <View
            className="rounded-xl border border-line bg-panel px-3 py-2.5"
            style={{ gap: 6 }}
            testID="daily-plan-progress"
          >
            <View className="flex-row justify-between">
              <Text className="text-xs font-semibold text-fg-muted">
                Прогрес журналу до цілі
              </Text>
              <Text
                className={`text-xs font-bold ${overBudget ? "text-danger-strong" : "text-fg"}`}
              >
                {Math.round(actualKcal)} / {targetKcal} ккал
              </Text>
            </View>
            <View
              className="rounded-full bg-line overflow-hidden"
              style={{ height: 6 }}
            >
              <View
                className={`h-full rounded-full ${overBudget ? "bg-danger" : "bg-nutrition"}`}
                style={{ width: `${progressPct}%` }}
                testID="daily-plan-progress-fill"
              />
            </View>
            <View className="flex-row flex-wrap" style={{ gap: 4 }}>
              <MacroBadge label="Б" value={todayMacros.protein_g} />
              <MacroBadge label="Ж" value={todayMacros.fat_g} />
              <MacroBadge label="В" value={todayMacros.carbs_g} />
            </View>
          </View>
        ) : null}

        {onFetchDayPlan ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Згенерувати денний план"
            disabled={dayPlanBusy}
            onPress={onFetchDayPlan}
            testID="daily-plan-fetch-button"
            className="rounded-2xl bg-nutrition-strong items-center justify-center"
            style={{
              minHeight: 44,
              paddingVertical: 12,
              opacity: dayPlanBusy ? 0.5 : 1,
            }}
          >
            <Text className="text-sm font-bold text-white">
              {dayPlanBusy ? "Генерую план…" : "Згенерувати денний план"}
            </Text>
          </Pressable>
        ) : null}

        {sortedMeals.length > 0 ? (
          <View style={{ gap: 8 }} testID="daily-plan-meals">
            <View className="flex-row justify-between items-center">
              <SectionHeading size="xs" variant="muted">
                Ваш план на сьогодні
              </SectionHeading>
              {dayPlan?.totalKcal != null ? (
                <Text className="text-xs text-fg-muted">
                  ~{Math.round(dayPlan.totalKcal)} ккал разом
                </Text>
              ) : null}
            </View>
            {sortedMeals.map((meal, i) => (
              <DailyPlanMealRow
                key={`${meal.type}-${i}`}
                meal={meal}
                onAddToLog={(m) => {
                  onAddMealToLog?.(m);
                }}
                onRegen={(t) => {
                  onRegenMeal?.(t);
                }}
                busy={dayPlanBusy}
                testID={`daily-plan-meal-${i}`}
              />
            ))}
            {dayPlan?.note ? (
              <Text className="text-xs text-fg-muted">{dayPlan.note}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
