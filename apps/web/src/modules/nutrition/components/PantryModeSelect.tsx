/**
 * Last validated: 2026-08-10
 * Status: Active
 *
 * Пікер «Як враховувати комору». Один контрол на весь розділ «Меню» —
 * значення живе в `prefs.recipePantryMode` і керує ТРЬОМА генераторами:
 * рецептами, денним планом і тижневим планом.
 *
 * AI-CONTEXT: раніше цей select стояв тільки в картці рецептів, і вибір
 * «Не враховувати комору» на плани не впливав узагалі — параметр не
 * доїжджав ні в тіло запиту, ні в промпт. Контрол винесено сюди, щоб він
 * був на обох під-вкладках і щоб копія («усіх генераторів») не розʼїхалась
 * між двома копіпастами.
 */
import type { Dispatch, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";
import { Select } from "@shared/components/ui/Select";

const copy = messages.nutrition.pantryMode;

interface PantryModeSelectProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  disabled?: boolean | undefined;
}

export function PantryModeSelect({
  prefs,
  setPrefs,
  disabled,
}: PantryModeSelectProps) {
  return (
    <label className="block">
      <span className="block text-style-caption text-muted mb-1">
        {copy.label}
      </span>
      <Select
        aria-label={copy.ariaLabel}
        value={prefs.recipePantryMode}
        onChange={(e) =>
          setPrefs((p) => ({
            ...p,
            recipePantryMode: e.target
              .value as NutritionPrefs["recipePantryMode"],
          }))
        }
        disabled={disabled}
      >
        <option value="prefer">{copy.prefer}</option>
        <option value="only">{copy.only}</option>
        <option value="ignore">{copy.ignore}</option>
      </Select>
      <span className="block text-style-caption text-muted mt-1">
        {copy.scopeHint}
      </span>
    </label>
  );
}
