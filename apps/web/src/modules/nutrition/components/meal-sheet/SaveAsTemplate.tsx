/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { useToast } from "@shared/hooks/useToast";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
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
              err: "Спочатку введи назву швидкого прийому.",
            }));
            return;
          }
          const parsedMacros = (
            ["kcal", "protein_g", "fat_g", "carbs_g"] as const
          ).map((key) =>
            form[key] === "" ? null : parseDecimalInput(form[key]),
          );
          if (parsedMacros.some((macro) => macro != null && !macro.ok)) {
            setForm((s) => ({
              ...s,
              err: "Некоректне КБЖВ для швидкого прийому.",
            }));
            return;
          }
          const [kcal, protein_g, fat_g, carbs_g] = parsedMacros.map((macro) =>
            macro != null && macro.ok ? macro.value : null,
          ) as [number | null, number | null, number | null, number | null];
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
            const normalizedName = name.toLocaleLowerCase("uk-UA");
            const duplicate = existing.find(
              (template) =>
                template.mealType === form.mealType &&
                template.name.trim().toLocaleLowerCase("uk-UA") ===
                  normalizedName,
            );
            return {
              ...p,
              mealTemplates: [
                {
                  id: duplicate?.id ?? `tpl_${Date.now()}`,
                  name,
                  mealType: form.mealType,
                  macros,
                },
                ...existing.filter((template) => template.id !== duplicate?.id),
              ].slice(0, 40),
            };
          });
          toast.success(
            editingTemplateId
              ? `Швидкий прийом «${name}» оновлено.`
              : `Швидкий прийом «${name}» збережено.`,
          );
          onDoneEditing?.();
        }}
      >
        {isEditing ? "Оновити швидкий прийом" : "+ Запамʼятати для повтору"}
      </button>
    </div>
  );
}
