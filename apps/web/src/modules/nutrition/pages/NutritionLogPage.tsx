/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import {
  todayISODate,
  type Meal,
  type MealTypeId,
} from "@sergeant/nutrition-domain";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { messages } from "@shared/i18n/uk";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import { LogCard } from "../components/LogCard";
import { newMealId } from "../lib/mealId";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { EditingMealState } from "../hooks/useNutritionUiState";
import type {
  MealPantryLink,
  MealPantryOffer,
} from "../hooks/useMealPantryOffer";

type LogController = ReturnType<typeof useNutritionLog>;
type Toast = ReturnType<typeof useToast>;

interface NutritionLogPageProps {
  log: LogController;
  toast: Toast;
  setEditingMeal: Dispatch<SetStateAction<EditingMealState | null>>;
  /** «Списати … із комори?» після запису з пошуку (OD-27 Х-4 а). */
  pantryOffer?: MealPantryOffer | undefined;
}

export function NutritionLogPage({
  log,
  toast,
  setEditingMeal,
  pantryOffer,
}: NutritionLogPageProps) {
  return (
    <SectionErrorBoundary key="page-log" title="Не вдалось показати «Щоденник»">
      <h1 className="sr-only">{messages.nav.nutritionLog}</h1>
      <LogCard
        log={log.nutritionLog}
        selectedDate={log.selectedDate}
        setSelectedDate={log.setSelectedDate}
        onAddMealFromSearch={(meal) => {
          const id = newMealId();
          // День запису віддає сам `handleAddMeal`: `log.selectedDate` цього
          // рендеру міг відстати від годинника, і «Скасувати» не знайшло б
          // запис.
          const dateForLog = log.handleAddMeal({ ...meal, id });
          const pending: { link?: MealPantryLink | undefined } = {};
          // Додавання миттєве і без підтвердження, тож тост мусить нести
          // «Скасувати» — як аркуш прийому (`NutritionApp`) і як видалення
          // нижче. Без цього помилковий тап по рядку пошуку коштував
          // ручного пошуку запису й видалення (знахідка PR-N1, аудит
          // 2026-09-13).
          const recordToastId = showUndoToast(toast, {
            msg: "Страву додано",
            onUndo: () => {
              log.handleRemoveMeal(dateForLog, id);
              pending.link?.undo();
            },
          });
          pending.link = pantryOffer?.([meal], { after: recordToastId });
        }}
        onRemoveMeal={(date: string, meal: Meal) => {
          if (!meal?.id) return;
          log.handleRemoveMeal(date, meal);
          showUndoToast(toast, {
            msg: "Запис видалено",
            onUndo: () => log.handleRestoreMeal(date, meal),
          });
        }}
        onEditMeal={(date: string, meal: Meal) => {
          setEditingMeal({ date, ...meal });
          log.setAddMealSheetOpen(true);
        }}
        onCopyMeals={(meals: Meal[], date: string, mealType: MealTypeId) => {
          const ids = log.handleCopyMeals(meals, date, mealType);
          if (ids.length === 0) return;
          log.setSelectedDate(date);
          showUndoToast(toast, {
            msg:
              date === todayISODate()
                ? "Скопійовано на сьогодні"
                : "Прийом скопійовано",
            onUndo: () => ids.forEach((id) => log.handleRemoveMeal(date, id)),
          });
        }}
        onDuplicateYesterday={log.duplicateYesterday}
        onTrimLog={log.trimLogToLastDays}
      />
    </SectionErrorBoundary>
  );
}
