import type { Dispatch, SetStateAction } from "react";
import type { Meal } from "@sergeant/nutrition-domain";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import { LogCard } from "../components/LogCard";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { EditingMealState } from "../hooks/useNutritionUiState";

type LogController = ReturnType<typeof useNutritionLog>;
type Toast = ReturnType<typeof useToast>;

interface NutritionLogPageProps {
  log: LogController;
  toast: Toast;
  setEditingMeal: Dispatch<SetStateAction<EditingMealState | null>>;
}

export function NutritionLogPage({
  log,
  toast,
  setEditingMeal,
}: NutritionLogPageProps) {
  return (
    <SectionErrorBoundary key="page-log" title="Не вдалось показати «Щоденник»">
      <LogCard
        log={log.nutritionLog}
        selectedDate={log.selectedDate}
        setSelectedDate={log.setSelectedDate}
        onAddMeal={() => {
          log.setAddMealPhotoResult(null);
          log.setAddMealSheetOpen(true);
        }}
        onAddMealFromSearch={(meal) => {
          const id = `meal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
          log.setAddMealPhotoResult(null);
          log.setAddMealSheetOpen(true);
        }}
        onDuplicateYesterday={log.duplicateYesterday}
        onTrimLog={log.trimLogToLastDays}
      />
    </SectionErrorBoundary>
  );
}
