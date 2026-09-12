/**
 * Last validated: 2026-09-08
 * Status: Active
 *
 * Portion control for a meal linked to the pantry but not to a nutrition
 * database card. A pantry link must never force the implicit 100 g fallback:
 * it controls consumption, while nutrition data may remain unknown.
 */
import { Input } from "@shared/components/ui/Input";
import { WheelPicker } from "@shared/components/ui/WheelPicker";
import { useCoarsePointer } from "@shared/hooks/useCoarsePointer";

import { MAX_PORTION_GRAMS } from "./mealFormUtils";
import { useWheelGrams } from "./useWheelGrams";
import { nutritionPageMessages as nutritionCopy } from "@shared/i18n/uk.nutrition";

interface PantryPortionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function PantryPortionField({
  value,
  onChange,
}: PantryPortionFieldProps) {
  const coarsePointer = useCoarsePointer();
  const wheel = useWheelGrams(value);
  return (
    <div className="mb-4 rounded-2xl border border-line bg-panelHi p-3">
      <label
        id="pantry-portion-label"
        className="block text-style-label text-text"
        htmlFor="pantry-portion"
      >
        {nutritionCopy.pantryPortion.label}
      </label>
      <p className="mt-1 text-style-caption text-subtle">
        {nutritionCopy.pantryPortion.description}
      </p>
      {coarsePointer ? (
        <WheelPicker
          values={wheel.values}
          value={wheel.value}
          onChange={(grams) => onChange(String(grams))}
          aria-labelledby="pantry-portion-label"
          formatValue={(grams) => `${grams} г`}
          className="mt-2"
        />
      ) : (
        <Input
          id="pantry-portion"
          className="mt-2"
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.value;
            const normalized = next.replace(",", ".");

            if (!/^\d*(?:\.\d*)?$/.test(normalized)) {
              return;
            }

            if (normalized === "" || normalized === ".") {
              onChange(next);
              return;
            }

            const parsed = Number(normalized);
            if (parsed > 0 && parsed <= MAX_PORTION_GRAMS) {
              onChange(next);
            }
          }}
          inputMode="decimal"
          maxLength={8}
          showCharCount={false}
          aria-describedby="pantry-portion-help"
        />
      )}
      <p id="pantry-portion-help" className="sr-only">
        {nutritionCopy.pantryPortion.a11yPrefix} {MAX_PORTION_GRAMS}{" "}
        {nutritionCopy.pantryPortion.a11ySuffix}
      </p>
    </div>
  );
}
