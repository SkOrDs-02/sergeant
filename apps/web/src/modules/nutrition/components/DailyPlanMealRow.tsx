import { cn } from "@shared/lib/ui/cn";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Measure } from "@shared/components/ui/Measure";
import type { MealTypeId } from "@sergeant/nutrition-domain";

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
interface DailyPlanMealRowProps {
  meal: PlanMeal;
  onAddToLog: (meal: PlanMeal) => void | Promise<void>;
  onRegen: (mealType: string) => void | Promise<void>;
  busy?: boolean | undefined;
}

export function DailyPlanMealRow({
  meal,
  onAddToLog,
  onRegen,
  busy,
}: DailyPlanMealRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={cn(FIELD_LABEL, "mb-0.5")}>
            {MEAL_TYPE_LABELS[String(meal.type ?? "")] || meal.label}
          </div>
          <div className="text-style-body font-semibold text-text">
            {meal.name}
          </div>
          {meal.description && (
            <div className="mt-0.5 text-style-caption text-muted">
              {meal.description}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-x-2 text-style-caption text-muted tabular-nums">
            {meal.kcal != null && (
              <span className="font-medium text-text">
                <Measure value={Math.round(meal.kcal)} unit="ккал" />
              </span>
            )}
            {meal.protein_g != null && (
              <span>
                Б <Measure value={Math.round(meal.protein_g)} unit="г" />
              </span>
            )}
            {meal.fat_g != null && (
              <span>
                Ж <Measure value={Math.round(meal.fat_g)} unit="г" />
              </span>
            )}
            {meal.carbs_g != null && (
              <span>
                В <Measure value={Math.round(meal.carbs_g)} unit="г" />
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onAddToLog(meal)}
            disabled={busy}
          >
            Журнал
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRegen(String(meal.type ?? ""))}
            disabled={busy}
          >
            Замінити
          </Button>
        </div>
      </div>
      {(meal.ingredients?.length ?? 0) > 0 && (
        <button
          type="button"
          className="mt-2 rounded-lg text-style-label font-semibold text-muted hover:text-text focus-ring"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Сховати інгредієнти" : "Інгредієнти"}
        </button>
      )}
      {expanded && (meal.ingredients?.length ?? 0) > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-style-caption text-text">
          {meal.ingredients?.map((ing: string, i: number) => (
            <li key={i}>{ing}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
