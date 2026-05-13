import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { MealTypeId } from "@sergeant/nutrition-domain";
import { MacroBadge } from "./DailyPlanMacros";

export interface PlanMeal {
  type?: MealTypeId | string;
  label?: string;
  name?: string;
  description?: string;
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  ingredients?: string[];
  [key: string]: unknown;
}

export const MEAL_TYPE_ORDER: readonly string[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];
export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
};
export const MEAL_TYPE_ICONS: Record<string, string> = {
  breakfast: "☀️",
  lunch: "🥗",
  dinner: "🍽️",
  snack: "🍎",
};

interface DailyPlanMealRowProps {
  meal: PlanMeal;
  onAddToLog: (meal: PlanMeal) => void | Promise<void>;
  onRegen: (mealType: string) => void | Promise<void>;
  busy?: boolean;
}

export function DailyPlanMealRow({
  meal,
  onAddToLog,
  onRegen,
  busy,
}: DailyPlanMealRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-line bg-bg/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-base leading-none" aria-hidden>
              {MEAL_TYPE_ICONS[String(meal.type ?? "")] || "🍴"}
            </span>
            <SectionHeading as="span" size="sm" variant="nutrition">
              {MEAL_TYPE_LABELS[String(meal.type ?? "")] || meal.label}
            </SectionHeading>
          </div>
          <div className="text-style-label text-text leading-tight">
            {meal.name}
          </div>
          {meal.description && (
            <div className="text-xs text-subtle mt-0.5 leading-snug">
              {meal.description}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {meal.kcal != null && (
              <MacroBadge
                label="ккал"
                value={meal.kcal}
                unit=""
                color="bg-nutrition/10 border border-nutrition/20 text-nutrition-strong dark:text-nutrition"
              />
            )}
            <MacroBadge label="Б" value={meal.protein_g} />
            <MacroBadge label="Ж" value={meal.fat_g} />
            <MacroBadge label="В" value={meal.carbs_g} />
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0 items-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onAddToLog(meal)}
            disabled={busy}
          >
            + Журнал
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onRegen(String(meal.type ?? ""))}
            disabled={busy}
          >
            ↻ Замінити
          </Button>
        </div>
      </div>
      {(meal.ingredients?.length ?? 0) > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-nutrition-strong/90 dark:text-nutrition/70 hover:text-nutrition-strong dark:text-nutrition transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "▲ Сховати інгредієнти" : "▼ Інгредієнти"}
        </button>
      )}
      {expanded && (meal.ingredients?.length ?? 0) > 0 && (
        <ul className="mt-1.5 text-xs text-text list-disc pl-4 space-y-0.5">
          {meal.ingredients!.map((ing: string, i: number) => (
            <li key={i}>{ing}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
