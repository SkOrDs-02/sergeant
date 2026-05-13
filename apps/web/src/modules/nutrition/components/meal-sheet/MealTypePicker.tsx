import type { Dispatch, SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { MEAL_TYPES, type MealTypeId } from "../../lib/mealTypes";
import type { MealFormState } from "./mealFormUtils";
import { messages } from "@shared/i18n/uk";

interface MealTypePickerProps {
  mealType: MealTypeId;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function MealTypePicker({ mealType, setForm }: MealTypePickerProps) {
  return (
    <div className="mb-4">
      <SectionHeading as="div" size="xs" variant="nutrition" className="mb-2">
        {messages.nutrition.mealType}
      </SectionHeading>
      <div className="flex gap-2 flex-wrap">
        {MEAL_TYPES.map((mt) => (
          <button
            key={mt.id}
            type="button"
            onClick={() => setForm((s) => ({ ...s, mealType: mt.id }))}
            className={cn(
              "text-style-label px-3 py-1.5 rounded-xl border transition-[background-color,border-color,color,opacity]",
              mealType === mt.id
                ? "bg-nutrition-strong text-white border-nutrition"
                : "bg-panelHi text-muted border-line hover:border-nutrition/50",
            )}
          >
            {mt.emoji} {mt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
