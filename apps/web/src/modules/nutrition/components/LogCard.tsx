/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
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
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-style-title text-text">
              {formatDate(selectedDate)}
            </p>
            <p className="text-style-label text-muted">
              {formatLogDateSubline(selectedDate)}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="touch-target flex h-11 w-11 items-center justify-center rounded-lg text-text hover:bg-line/40 focus-ring"
              aria-label="Попередній день"
            >
              <Icon name="chevron-left" size="md" />
            </button>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="touch-target flex h-11 w-11 items-center justify-center rounded-lg text-text hover:bg-line/40 focus-ring"
              aria-label="Наступний день"
            >
              <Icon name="chevron-right" size="md" />
            </button>
          </div>
        </div>

        {/* Лише для порожнього дня: над заповненим днем копія вчорашнього
            подвоїла б записи і відсувала б сам список униз. */}
        {typeof onDuplicateYesterday === "function" &&
          meals.length === 0 &&
          hasPreviousDayMeals && (
            <button
              type="button"
              onClick={() => setDuplicateConfirm(true)}
              className="w-full h-11 touch-target rounded-lg border border-border-strong px-3 text-style-label font-semibold text-text hover:bg-line/40 focus-ring"
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
          <EmptyState compact title="Поки немає записів" />
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
          className="w-full h-11 rounded-lg border border-border-strong text-style-label font-semibold text-text hover:bg-line/40 focus-ring"
        >
          Додати прийом їжі
        </button>

        <LogCardSearch
          log={log}
          setSelectedDate={setSelectedDate}
          onAddMealFromSearch={onAddMealFromSearch}
        />

        {logSizeWarn && (
          <div className="border-y border-line py-2 text-style-label text-text">
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
