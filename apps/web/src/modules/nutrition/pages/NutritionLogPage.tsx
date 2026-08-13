/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { messages } from "@shared/i18n/uk";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import { LogCard } from "../components/LogCard";
import { newMealId } from "../lib/mealId";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { EditingMealState } from "../hooks/useNutritionUiState";

type LogController = ReturnType<typeof useNutritionLog>;
type Toast = ReturnType<typeof useToast>;

interface NutritionLogPageProps {
  log: LogController;
  toast: Toast;
  setEditingMeal: Dispatch<SetStateAction<EditingMealState | null>>;
  /**
   * Create-флоу відкривається через хост (NutritionApp), а не напряму
   * `setAddMealSheetOpen`: хост скидає крок sheet-а на "source", інакше
   * після фото-CTA наступне «Додати» відкрилось би на кроці фото.
   */
  onOpenAddMeal: () => void;
}

export function NutritionLogPage({
  log,
  toast,
  setEditingMeal,
  onOpenAddMeal,
}: NutritionLogPageProps) {
  return (
    <SectionErrorBoundary key="page-log" title="Не вдалось показати «Щоденник»">
      <h1 className="sr-only">{messages.nav.nutritionLog}</h1>
      <LogCard
        log={log.nutritionLog}
        selectedDate={log.selectedDate}
        setSelectedDate={log.setSelectedDate}
        onAddMeal={onOpenAddMeal}
        onAddMealFromSearch={(meal) => {
          const id = newMealId();
          log.handleAddMeal({ ...meal, id });
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
        onDuplicateYesterday={log.duplicateYesterday}
        onTrimLog={log.trimLogToLastDays}
      />
    </SectionErrorBoundary>
  );
}
