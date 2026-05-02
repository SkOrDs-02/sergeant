/**
 * Nutrition Log (Журнал) — mobile
 *
 * Читає MMKV-nutrition-log та показує прийоми їжі за вибрану дату
 * (today за замовчуванням). Стрілки ← / → для переключення днів.
 * Рядок прийому показує: тип (емодзі), назву, кількість ккал і
 * макроси б/ж/в.
 *
 * PR-5 adds:
 *  - "+ Додати" FAB → AddMealSheet
 *  - Long-press meal row → edit in AddMealSheet
 *  - Swipe-to-delete (ConfirmDialog)
 */
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import {
  addDaysISODate,
  getDayMacros,
  labelForMealType,
  MEAL_META,
  MEAL_ORDER,
  type Meal,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import { toLocalISODate } from "@sergeant/shared";

import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { showUndoToast } from "@/lib/showUndoToast";

import {
  AddMealSheet,
  type InitialMeal,
  type MealSavePayload,
} from "../components/AddMealSheet";
import { useNutritionLog } from "../hooks/useNutritionLog";

function formatIsoDate(iso: string): string {
  const today = toLocalISODate(new Date());
  const yesterday = addDaysISODate(today, -1);
  const tomorrow = addDaysISODate(today, 1);
  if (iso === today) return "Сьогодні";
  if (iso === yesterday) return "Вчора";
  if (iso === tomorrow) return "Завтра";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const months = [
    "січ",
    "лют",
    "бер",
    "квіт",
    "трав",
    "черв",
    "лип",
    "сер",
    "вер",
    "жовт",
    "лист",
    "груд",
  ];
  return `${dt.getDate()} ${months[dt.getMonth()]}`;
}

interface MealRow {
  meal: Meal;
  emoji: string;
  typeLabel: string;
}

function getRowsForDate(log: NutritionLog, date: string): MealRow[] {
  const day = log?.[date];
  if (!day || !Array.isArray(day.meals)) return [];
  const copy: Meal[] = day.meals.slice();
  copy.sort((a, b) => {
    const ai = MEAL_ORDER.indexOf(a.mealType);
    const bi = MEAL_ORDER.indexOf(b.mealType);
    if (ai !== bi) return ai - bi;
    return (a.time || "").localeCompare(b.time || "");
  });
  return copy.map((meal) => ({
    meal,
    emoji: MEAL_META[meal.mealType]?.emoji ?? "🍽️",
    typeLabel: labelForMealType(meal.mealType),
  }));
}

export interface LogProps {
  testID?: string;
  onMealAdded?: () => void;
}

export function Log({ testID, onMealAdded }: LogProps) {
  const {
    nutritionLog,
    selectedDate,
    setSelectedDate,
    addMeal,
    updateMeal,
    removeMeal,
  } = useNutritionLog();
  const toast = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editMeal, setEditMeal] = useState<InitialMeal | null>(null);

  const handleAdd = useCallback(() => {
    setEditMeal(null);
    setSheetOpen(true);
  }, []);

  const handleEdit = useCallback((meal: Meal) => {
    setEditMeal({
      id: meal.id,
      name: meal.name,
      mealType: meal.mealType,
      time: meal.time,
      macros: meal.macros,
    });
    setSheetOpen(true);
  }, []);

  const handleSave = useCallback(
    (payload: MealSavePayload) => {
      if (editMeal?.id) {
        updateMeal(selectedDate, payload);
      } else {
        addMeal(selectedDate, payload);
      }
      setSheetOpen(false);
      setEditMeal(null);
      onMealAdded?.();
    },
    [editMeal, selectedDate, addMeal, updateMeal, onMealAdded],
  );

  // Замість ConfirmDialog — single-tap видалення з undo-toast (parity з web).
  const handleDeleteMeal = useCallback(
    (meal: Meal) => {
      removeMeal(selectedDate, meal.id);
      const dateAtDelete = selectedDate;
      const mealName = meal.name || "прийом";
      showUndoToast(toast, {
        msg: `Видалено «${mealName}»`,
        onUndo: () => addMeal(dateAtDelete, meal),
      });
    },
    [addMeal, removeMeal, selectedDate, toast],
  );

  const rows = useMemo(
    () => getRowsForDate(nutritionLog, selectedDate),
    [nutritionLog, selectedDate],
  );

  const macros = useMemo(
    () => getDayMacros(nutritionLog, selectedDate),
    [nutritionLog, selectedDate],
  );

  const goPrev = () => setSelectedDate(addDaysISODate(selectedDate, -1));
  const goNext = () => setSelectedDate(addDaysISODate(selectedDate, 1));
  const goToday = () => setSelectedDate(toLocalISODate(new Date()));

  const isToday = selectedDate === toLocalISODate(new Date());

  return (
    <View testID={testID} className="flex-1 bg-cream-50">
      {/* Date switcher */}
      <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
        <Pressable
          onPress={goPrev}
          accessibilityRole="button"
          accessibilityLabel="Попередній день"
          testID="nutrition-log-prev-day"
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <Text className="text-xl text-fg-muted">‹</Text>
        </Pressable>
        <Pressable
          onPress={goToday}
          accessibilityRole="button"
          accessibilityLabel="Повернутись на сьогодні"
          testID="nutrition-log-today"
          className="flex-1 items-center"
        >
          <Text className="text-sm font-bold text-fg">
            {formatIsoDate(selectedDate)}
          </Text>
          {!isToday ? (
            <Text className="text-[10px] text-fg-subtle mt-0.5">
              {selectedDate}
            </Text>
          ) : null}
        </Pressable>
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="Наступний день"
          testID="nutrition-log-next-day"
          className="w-10 h-10 items-center justify-center rounded-full"
        >
          <Text className="text-xl text-fg-muted">›</Text>
        </Pressable>
      </View>

      {/* Macro summary */}
      <View className="px-4 pb-3">
        <Card>
          <View className="flex-row justify-around py-1">
            <View className="items-center">
              <Text className="text-[10px] font-bold uppercase text-fg-muted">
                Ккал
              </Text>
              <Text className="text-sm font-extrabold text-fg mt-1">
                {Math.round(macros.kcal)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] font-bold uppercase text-fg-muted">
                Б
              </Text>
              <Text className="text-sm font-extrabold text-fg mt-1">
                {Math.round(macros.protein_g)} г
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] font-bold uppercase text-fg-muted">
                Ж
              </Text>
              <Text className="text-sm font-extrabold text-fg mt-1">
                {Math.round(macros.fat_g)} г
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] font-bold uppercase text-fg-muted">
                В
              </Text>
              <Text className="text-sm font-extrabold text-fg mt-1">
                {Math.round(macros.carbs_g)} г
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* Add meal button */}
      <View className="px-4 pb-2">
        <Pressable
          onPress={handleAdd}
          accessibilityRole="button"
          accessibilityLabel="Додати прийом їжі"
          testID="nutrition-log-add-meal-btn"
          className="bg-lime-600 rounded-xl py-2.5 items-center"
        >
          <Text className="text-sm font-bold text-white">+ Додати прийом</Text>
        </Pressable>
      </View>

      {/* Meals list */}
      {rows.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6 pb-20">
          <Text className="text-5xl mb-3">🍽️</Text>
          <Text className="text-sm font-semibold text-fg text-center">
            Немає записів за цей день
          </Text>
          <Text className="text-xs text-fg-muted text-center mt-1">
            Натисніть «+ Додати прийом», щоб записати їжу.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.meal.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 24,
            gap: 8,
          }}
          renderItem={({ item }) => (
            <Pressable
              onLongPress={() => handleEdit(item.meal)}
              accessibilityRole="button"
              accessibilityLabel={`Редагувати ${item.meal.name || "прийом"}`}
              accessibilityHint="Довге натиснення для редагування"
            >
              <Card testID={`nutrition-log-meal-${item.meal.id}`}>
                <View className="flex-row items-start gap-3">
                  <Text className="text-2xl leading-none">{item.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-[10px] font-bold uppercase text-fg-muted leading-none">
                      {item.typeLabel}
                    </Text>
                    <Text className="text-sm font-semibold text-fg mt-1">
                      {item.meal.name || "Без назви"}
                    </Text>
                    <View className="flex-row items-center gap-3 mt-2">
                      <Text className="text-xs text-fg-muted">
                        {Math.round(item.meal.macros?.kcal || 0)} ккал
                      </Text>
                      <Text className="text-xs text-fg-subtle">
                        Б{Math.round(item.meal.macros?.protein_g || 0)} · Ж
                        {Math.round(item.meal.macros?.fat_g || 0)} · В
                        {Math.round(item.meal.macros?.carbs_g || 0)}
                      </Text>
                      <Pressable
                        onPress={() => handleDeleteMeal(item.meal)}
                        accessibilityRole="button"
                        accessibilityLabel={`Видалити ${item.meal.name || "прийом"}`}
                        hitSlop={8}
                        className="ml-auto"
                      >
                        <Text className="text-xs text-red-400">✖</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}

      <AddMealSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setEditMeal(null);
        }}
        onSave={handleSave}
        initialMeal={editMeal}
      />
    </View>
  );
}
