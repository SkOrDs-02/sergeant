import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { MealTemplate } from "@sergeant/nutrition-domain";
import type { MealFormState } from "./mealFormUtils";

interface MealTemplatesRowProps {
  mealTemplates: MealTemplate[];
  setForm: Dispatch<SetStateAction<MealFormState>>;
  onSelected?: () => void;
}

export function MealTemplatesRow({
  mealTemplates,
  setForm,
  onSelected,
}: MealTemplatesRowProps) {
  if (!Array.isArray(mealTemplates) || mealTemplates.length === 0) return null;
  return (
    <div className="mb-4">
      <SectionHeading as="div" size="xs" className="mb-2">
        Шаблони
      </SectionHeading>
      <div className="flex flex-wrap gap-2">
        {mealTemplates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setForm((s) => ({
                ...s,
                name: t.name,
                mealType: t.mealType || "snack",
                kcal:
                  t.macros?.kcal != null
                    ? String(Math.round(t.macros.kcal))
                    : "",
                protein_g:
                  t.macros?.protein_g != null
                    ? String(Math.round(t.macros.protein_g))
                    : "",
                fat_g:
                  t.macros?.fat_g != null
                    ? String(Math.round(t.macros.fat_g))
                    : "",
                carbs_g:
                  t.macros?.carbs_g != null
                    ? String(Math.round(t.macros.carbs_g))
                    : "",
                err: "",
              }));
              onSelected?.();
            }}
            className="px-2 py-1 rounded-xl text-xs border border-line bg-panelHi hover:border-nutrition/50"
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
