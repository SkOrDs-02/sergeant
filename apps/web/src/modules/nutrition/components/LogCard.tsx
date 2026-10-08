/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { NutritionEmptyIllustration } from "@shared/components/ui/EmptyStateIllustrations";
import { estimateLogBytes } from "../lib/nutritionStorage";
import {
  addDaysISODate,
  todayISODate,
  type Meal,
  type MealTypeId,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import { isMealTypeId, mealTypeFromLabel } from "../lib/mealTypes";
import { formatLogDateSubline } from "../lib/formatLogDateSubline";
import { CopyMealSheet } from "./CopyMealSheet";
import { DayLogSheet } from "./DayLogSheet";
import { LogCardSearch } from "./LogCardSearch";
import { LogCardWeeklyTable } from "./LogCardWeeklyTable";
import { LogCardAnalytics } from "./LogCardAnalytics";
import { MealMomentLine } from "./MealMomentLine";

interface LogCardProps {
  log: NutritionLog;
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  onAddMeal?: () => void;
  onAddMealFromSearch?: (meal: Meal, date?: string) => void;
  onRemoveMeal?: (date: string, meal: Meal) => void;
  onEditMeal?: (date: string, meal: Meal) => void;
  onCopyMeals?: (meals: Meal[], date: string, mealType: MealTypeId) => void;
  onDuplicateYesterday?: () => void;
  onTrimLog?: (keepDays: number) => void;
}

function formatDate(isoDate: string): string {
  // ADR-0078: "Сьогодні"/"Вчора"/"Завтра" мусять збігатись із ключем, під
  // яким журнал зберігає записи (selectedDate — день пристрою), інакше
  // мітка "Сьогодні" вказувала б не на той день, що реально відкритий.
  const today = todayISODate();
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
    (groups[mealType] ??= []).push(meal);
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
  onCopyMeals,
  onDuplicateYesterday,
  onTrimLog,
}: LogCardProps) {
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [trimConfirm, setTrimConfirm] = useState(false);
  const [copyType, setCopyType] = useState<MealTypeId | null>(null);

  const dayData = log[selectedDate];
  const meals = dayData?.meals || [];
  const groups = groupByMealType(meals);

  const logBytes = useMemo(() => estimateLogBytes(log), [log]);
  const logSizeWarn = logBytes > 350_000;

  function shiftDate(delta: number) {
    setSelectedDate(addDaysISODate(selectedDate, delta));
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
            className="w-10 h-10 touch-target flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Попередній день"
          >
            <Icon name="chevron-left" size="sm" />
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-extrabold text-text text-base">
              {formatDate(selectedDate)}
            </span>
            <span className="text-style-caption text-subtle">
              {formatLogDateSubline(selectedDate)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="w-10 h-10 touch-target flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Наступний день"
          >
            <Icon name="chevron-right" size="sm" />
          </button>
        </div>

        {/* Лише для порожнього дня: над заповненим днем копія вчорашнього
            подвоїла б записи і відсувала б сам список униз. */}
        {typeof onDuplicateYesterday === "function" &&
          meals.length === 0 &&
          hasPreviousDayMeals && (
            <button
              type="button"
              onClick={() => setDuplicateConfirm(true)}
              className="w-full h-10 touch-target rounded-2xl border border-line bg-panel px-3 text-style-caption text-subtle hover:text-text hover:border-nutrition/50 transition-colors flex items-center justify-center gap-1.5"
            >
              {/* Підпис бере той самий `formatDate`, що й заголовок вище:
                він уміє «Вчора» / «Сьогодні» і лише для дальших дат падає
                в `ДД.ММ.РРРР`. Раніше тут стояв сирий `previousDayIso`
                (`2026-09-11`) — і це впадало в око саме тому, що поруч, за
                60 рядків вище, та сама дата вже показана по-людськи
                (знахідка PR-N6, аудит 2026-09-13). */}
              Скопіювати з попереднього дня ({formatDate(previousDayIso)})
            </button>
          )}

        {/*
          П3 «край і зріз»: аркуш дня — це `DayLogSheet`, і все, що стоїть
          у цьому `flex-col` навколо нього, аркушем НЕ є. Перемикач дати,
          пошук, «скопіювати з попереднього дня», попередження про розмір
          журналу й «+ Додати прийом їжі» — органи керування записом;
          обвести їх перфорацією означало б повторити помилку, за яку край
          зняли з hero Рутини. Розбір — в `DayLogSheet.tsx`.

          Порожній стан лишається ПОЗА аркушем: він повідомляє про
          відсутність запису, а не є записом.
        */}
        {meals.length === 0 ? (
          <EmptyState
            compact
            illustration={<NutritionEmptyIllustration size={64} />}
            module="nutrition"
            title="Поки немає записів"
            description="Додай перший прийом їжі, щоб почати вести журнал."
          />
        ) : (
          <DayLogSheet
            groups={groups}
            meals={meals}
            selectedDate={selectedDate}
            onRemoveMeal={onRemoveMeal}
            onEditMeal={onEditMeal}
            onCopyMeals={onCopyMeals ? setCopyType : undefined}
          />
        )}

        <MealMomentLine date={selectedDate} />

        <button
          type="button"
          onClick={onAddMeal}
          className="text-style-label w-full h-12 min-h-[44px] rounded-2xl border-2 border-dashed border-line text-muted hover:border-nutrition/60 hover:text-nutrition-strong dark:hover:text-nutrition transition-[border-color,color,background-color]"
        >
          + Додати прийом їжі
        </button>

        <LogCardSearch
          log={log}
          setSelectedDate={setSelectedDate}
          onAddMealFromSearch={onAddMealFromSearch}
        />

        {logSizeWarn && (
          <div className="rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2 text-style-caption text-warning-strong">
            Журнал великий (~{Math.round(logBytes / 1024)} КБ).{" "}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => setTrimConfirm(true)}
            >
              Залишити лише останні 365 днів
            </button>
          </div>
        )}

        <LogCardWeeklyTable log={log} selectedDate={selectedDate} />

        <LogCardAnalytics log={log} selectedDate={selectedDate} />
      </div>

      <CopyMealSheet
        key={copyType ?? "closed"}
        mealType={copyType}
        onClose={() => setCopyType(null)}
        onCopy={(date, mealType) => {
          if (copyType) onCopyMeals?.(groups[copyType] ?? [], date, mealType);
          setCopyType(null);
        }}
      />

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
