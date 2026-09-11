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
import { useLocale } from "@shared/i18n/useLocale";
import { useMemo } from "react";

import { MAX_PORTION_GRAMS, portionGramValues } from "./mealFormUtils";

interface PantryPortionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

export function PantryPortionField({
  value,
  onChange,
}: PantryPortionFieldProps) {
  const { messages } = useLocale();
  const coarsePointer = useCoarsePointer();
  const gramValues = useMemo(() => portionGramValues(value), [value]);
  return (
    <div className="mb-4 rounded-2xl border border-line bg-panelHi p-3">
      <label
        id="pantry-portion-label"
        className="block text-style-label text-text"
        htmlFor="pantry-portion"
      >
        {messages.nutrition.pantryPortion.label}
      </label>
      <p className="mt-1 text-style-caption text-subtle">
        {messages.nutrition.pantryPortion.description}
      </p>
      {coarsePointer ? (
        <WheelPicker
          values={gramValues}
          value={Number(value.replace(",", ".")) || 100}
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
        {messages.nutrition.pantryPortion.a11yPrefix} {MAX_PORTION_GRAMS}{" "}
        {messages.nutrition.pantryPortion.a11ySuffix}
      </p>
    </div>
  );
}
