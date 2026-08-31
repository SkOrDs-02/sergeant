/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { ADD_MEAL_SECTION_KEYS } from "./addMealSections";
import { Icon } from "@shared/components/ui/Icon";
import { IconButton } from "@shared/components/ui/IconButton";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { MealTemplate, NutritionPrefs } from "@sergeant/nutrition-domain";
import type { MealFormState } from "./mealFormUtils";
import { messages } from "@shared/i18n/uk";

interface MealTemplatesRowProps {
  mealTemplates: MealTemplate[];
  setForm: Dispatch<SetStateAction<MealFormState>>;
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>> | undefined;
  onSelected?: () => void;
  /** Called when the user taps the edit affordance on a template chip, so
   * the parent can switch `SaveAsTemplate` into "update in place" mode. */
  onEditTemplate?: (template: MealTemplate) => void;
}

function fillFormFromTemplate(
  setForm: Dispatch<SetStateAction<MealFormState>>,
  t: MealTemplate,
) {
  setForm((s) => ({
    ...s,
    name: t.name,
    mealType: t.mealType || "snack",
    kcal: t.macros?.kcal != null ? String(Math.round(t.macros.kcal)) : "",
    protein_g:
      t.macros?.protein_g != null ? String(Math.round(t.macros.protein_g)) : "",
    fat_g: t.macros?.fat_g != null ? String(Math.round(t.macros.fat_g)) : "",
    carbs_g:
      t.macros?.carbs_g != null ? String(Math.round(t.macros.carbs_g)) : "",
    err: "",
  }));
}

export function MealTemplatesRow({
  mealTemplates,
  setForm,
  setPrefs,
  onSelected,
  onEditTemplate,
}: MealTemplatesRowProps) {
  const toast = useToast();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  if (!Array.isArray(mealTemplates) || mealTemplates.length === 0) return null;
  const canManage = typeof setPrefs === "function";
  const confirmTarget = canManage
    ? mealTemplates.find((t) => t.id === confirmDeleteId)
    : undefined;

  function deleteTemplate(id: string) {
    if (!setPrefs) return;
    const idx = mealTemplates.findIndex((t) => t.id === id);
    const removed = idx >= 0 ? mealTemplates[idx] : undefined;
    setPrefs((p) => ({
      ...p,
      mealTemplates: (p.mealTemplates || []).filter((t) => t.id !== id),
    }));
    if (removed) {
      showUndoToast(toast, {
        msg: `Видалено швидкий прийом «${removed.name}»`,
        onUndo: () =>
          setPrefs((p) => {
            const next = Array.isArray(p.mealTemplates)
              ? [...p.mealTemplates]
              : [];
            if (!next.some((t) => t.id === removed.id)) {
              next.splice(Math.min(idx, next.length), 0, removed);
            }
            return { ...p, mealTemplates: next };
          }),
      });
    }
  }

  return (
    <>
      <CollapsibleSection
        storageKey={ADD_MEAL_SECTION_KEYS.templates}
        title={messages.nutrition.templates}
        defaultOpen={false}
        collapsedSubtitle={`${mealTemplates.length} шаблонів`}
        className="mb-4"
      >
        <div className="flex flex-wrap gap-2">
          {mealTemplates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-1 rounded-xl border border-line bg-panelHi"
            >
              <button
                type="button"
                onClick={() => {
                  fillFormFromTemplate(setForm, t);
                  onSelected?.();
                }}
                className="px-2 py-1 text-xs hover:text-nutrition-strong dark:hover:text-nutrition"
              >
                {t.name}
              </button>
              {canManage && (
                <>
                  <IconButton
                    aria-label={`Редагувати швидкий прийом ${t.name}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      fillFormFromTemplate(setForm, t);
                      onEditTemplate?.(t);
                      onSelected?.();
                    }}
                  >
                    <Icon name="edit" size={13} aria-hidden />
                  </IconButton>
                  <IconButton
                    aria-label={`Видалити швидкий прийом ${t.name}`}
                    variant="ghost"
                    size="sm"
                    className="text-danger-strong dark:text-danger"
                    onClick={() => setConfirmDeleteId(t.id)}
                  >
                    <Icon name="trash" size={13} aria-hidden />
                  </IconButton>
                </>
              )}
            </div>
          ))}
        </div>
      </CollapsibleSection>
      {/*
        Діалог живе ПОЗА згорнутою частиною: `CollapsibleSection` тримає
        дітей у DOM і ставить на них `inert`, тож підтвердження всередині
        стало б некликабельним, якби секцію згорнули з відкритим діалогом.
      */}
      <ConfirmDialog
        open={confirmDeleteId != null}
        title={messages.nutrition.deleteTemplateTitle}
        description={
          confirmTarget
            ? `«${confirmTarget.name}». Натисни «Повернути» у тості, якщо це випадково.`
            : undefined
        }
        onConfirm={() => {
          if (confirmDeleteId) deleteTemplate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </>
  );
}
