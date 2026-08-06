/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { useToast } from "@shared/hooks/useToast";
import type { MealFormState } from "./mealFormUtils";

interface SaveAsTemplateProps {
  form: MealFormState;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>> | undefined;
  /** When set, saving updates this template in place instead of appending
   * a new one — set via the edit affordance on `MealTemplatesRow`. */
  editingTemplateId?: string | null | undefined;
  onDoneEditing?: () => void;
}

export function SaveAsTemplate({
  form,
  setForm,
  setPrefs,
  editingTemplateId,
  onDoneEditing,
}: SaveAsTemplateProps) {
  const toast = useToast();
  if (typeof setPrefs !== "function") return null;
  const isEditing = Boolean(editingTemplateId);
  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-style-caption text-nutrition-strong dark:text-nutrition font-semibold hover:underline"
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
          const macros = { kcal, protein_g, fat_g, carbs_g };
          setPrefs((p) => {
            const existing = Array.isArray(p.mealTemplates)
              ? p.mealTemplates
              : [];
            if (editingTemplateId) {
              const idx = existing.findIndex((t) => t.id === editingTemplateId);
              const current = idx >= 0 ? existing[idx] : undefined;
              if (current) {
                const next = [...existing];
                next[idx] = {
                  ...current,
                  name,
                  mealType: form.mealType,
                  macros,
                };
                return { ...p, mealTemplates: next };
              }
            }
            return {
              ...p,
              mealTemplates: [
                ...existing,
                {
                  id: `tpl_${Date.now()}`,
                  name,
                  mealType: form.mealType,
                  macros,
                },
              ].slice(0, 40),
            };
          });
          toast.success(
            editingTemplateId
              ? `Шаблон «${name}» оновлено.`
              : `Шаблон «${name}» збережено.`,
          );
          onDoneEditing?.();
        }}
      >
        {isEditing ? "Оновити шаблон" : "+ Зберегти як шаблон"}
      </button>
    </div>
  );
}
