import type { Dispatch, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import type { MealFormState } from "./mealFormUtils";

interface SaveAsTemplateProps {
  form: MealFormState;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>> | undefined;
}

export function SaveAsTemplate({
  form,
  setForm,
  setPrefs,
}: SaveAsTemplateProps) {
  if (typeof setPrefs !== "function") return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-xs text-nutrition-strong dark:text-nutrition font-semibold hover:underline"
        onClick={() => {
          const name = form.name.trim();
          if (!name) {
            setForm((s) => ({
              ...s,
              err: "Спочатку введіть назву для шаблону.",
            }));
            return;
          }
          const kcal = form.kcal === "" ? 0 : Number(form.kcal);
          const protein_g = form.protein_g === "" ? 0 : Number(form.protein_g);
          const fat_g = form.fat_g === "" ? 0 : Number(form.fat_g);
          const carbs_g = form.carbs_g === "" ? 0 : Number(form.carbs_g);
          if (
            [kcal, protein_g, fat_g, carbs_g].some((n) => !Number.isFinite(n))
          ) {
            setForm((s) => ({ ...s, err: "Некоректне КБЖВ для шаблону." }));
            return;
          }
          setPrefs((p) => ({
            ...p,
            mealTemplates: [
              ...(Array.isArray(p.mealTemplates) ? p.mealTemplates : []),
              {
                id: `tpl_${Date.now()}`,
                name,
                mealType: form.mealType,
                macros: { kcal, protein_g, fat_g, carbs_g },
              },
            ].slice(0, 40),
          }));
        }}
      >
        + Зберегти як шаблон
      </button>
    </div>
  );
}
