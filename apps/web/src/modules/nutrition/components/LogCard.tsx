/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { NutritionEmptyIllustration } from "@shared/components/ui/EmptyStateIllustrations";
import { estimateLogBytes, toLocalISODate } from "../lib/nutritionStorage";
import {
  addDaysISODate,
  type Meal,
  type MealTypeId,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import { isMealTypeId, mealTypeFromLabel } from "../lib/mealTypes";
import { VirtualMealList } from "./VirtualMealList";
import { LogCardSearch } from "./LogCardSearch";
import { LogCardWeeklyTable } from "./LogCardWeeklyTable";
import { LogCardAnalytics } from "./LogCardAnalytics";

interface LogCardProps {
  log: NutritionLog;
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  onAddMeal?: () => void;
  onAddMealFromSearch?: (meal: Meal, date?: string) => void;
  onRemoveMeal?: (date: string, meal: Meal) => void;
  onEditMeal?: (date: string, meal: Meal) => void;
  onDuplicateYesterday?: () => void;
  onTrimLog?: (keepDays: number) => void;
}

function toISODate(d: Date): string {
  return toLocalISODate(d);
}

function formatDate(isoDate: string): string {
  const today = toISODate(new Date());
  const yesterday = addDaysISODate(today, -1);
  const tomorrow = addDaysISODate(today, 1);
  if (isoDate === today) return "Сьогодні";
  if (isoDate === yesterday) return "Вчора";
  if (isoDate === tomorrow) return "Завтра";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function groupByMealType(meals: Meal[]): Record<MealTypeId, Meal[]> {
  const groups: Partial<Record<MealTypeId, Meal[]>> = {};
  for (const meal of meals) {
    const mealType: MealTypeId = isMealTypeId(meal.mealType)
      ? meal.mealType
      : mealTypeFromLabel(meal.label);
    if (!groups[mealType]) groups[mealType] = [];
    groups[mealType]!.push(meal);
  }
  return groups as Record<MealTypeId, Meal[]>;
}

export function LogCard({
  log,
  selectedDate,
  setSelectedDate,
  onAddMeal,
  onAddMealFromSearch,
  onRemoveMeal,
  onEditMeal,
  onDuplicateYesterday,
  onTrimLog,
}: LogCardProps) {
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [trimConfirm, setTrimConfirm] = useState(false);

  const dayData = log[selectedDate];
  const meals = dayData?.meals || [];
  const groups = groupByMealType(meals);

  const logBytes = useMemo(() => estimateLogBytes(log), [log]);
  const logSizeWarn = logBytes > 350_000;

  function shiftDate(delta: number) {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const next = new Date(y!, m! - 1, d! + delta);
    setSelectedDate(toISODate(next));
  }

  const previousDayIso = addDaysISODate(selectedDate, -1);
  const hasPreviousDayMeals = (log[previousDayIso]?.meals?.length || 0) > 0;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Попередній день"
          >
            ‹
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-extrabold text-text text-base">
              {formatDate(selectedDate)}
            </span>
            <span className="text-xs text-subtle">{selectedDate}</span>
          </div>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Наступний день"
          >
            ›
          </button>
        </div>

        {typeof onDuplicateYesterday === "function" && hasPreviousDayMeals && (
          <button
            type="button"
            onClick={() => setDuplicateConfirm(true)}
            className="w-full h-10 rounded-2xl border border-line bg-panel/40 px-3 text-style-caption text-subtle hover:text-text hover:border-nutrition/50 transition-colors flex items-center justify-center gap-1.5"
          >
            Скопіювати з попереднього дня ({previousDayIso})
          </button>
        )}

        <LogCardSearch
          log={log}
          setSelectedDate={setSelectedDate}
          onAddMealFromSearch={onAddMealFromSearch}
        />

        {logSizeWarn && (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-strong">
            Журнал великий (~{Math.round(logBytes / 1024)} КБ).{" "}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => onTrimLog?.(365)}
            >
              Залишити лише останні 365 днів
            </button>
          </div>
        )}

        <LogCardWeeklyTable log={log} selectedDate={selectedDate} />

        <LogCardAnalytics log={log} selectedDate={selectedDate} />

        {meals.length === 0 ? (
          <EmptyState
            compact
            illustration={<NutritionEmptyIllustration size={64} />}
            module="nutrition"
            title="Поки немає записів"
            description="Додай перший прийом їжі, щоб почати вести журнал."
          />
        ) : (
          <VirtualMealList
            groups={groups}
            meals={meals}
            selectedDate={selectedDate}
            onRemoveMeal={onRemoveMeal}
            onEditMeal={onEditMeal}
          />
        )}

        <button
          type="button"
          onClick={onAddMeal}
          className="text-style-label w-full h-12 min-h-[44px] rounded-2xl border-2 border-dashed border-line text-muted hover:border-nutrition/60 hover:text-nutrition-strong dark:text-nutrition transition-[border-color,color,background-color]"
        >
          + Додати прийом їжі
        </button>
      </div>

      <ConfirmDialog
        open={duplicateConfirm}
        title="Скопіювати прийоми?"
        description="Скопіювати всі прийоми з попереднього дня в цей день?"
        confirmLabel="Скопіювати"
        danger={false}
        onConfirm={() => {
          setDuplicateConfirm(false);
          onDuplicateYesterday?.();
        }}
        onCancel={() => setDuplicateConfirm(false)}
      />

      <ConfirmDialog
        open={trimConfirm}
        title="Видалити стару історію?"
        description="Журнал буде обрізано до останніх 365 днів. Старіші прийоми та фото страв безповоротно видаляються."
        confirmLabel="Видалити"
        danger
        onConfirm={() => {
          setTrimConfirm(false);
          onTrimLog?.(365);
        }}
        onCancel={() => setTrimConfirm(false)}
      />
    </>
  );
}
