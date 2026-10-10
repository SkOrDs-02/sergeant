/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { MEAL_TYPES, type MealTypeId } from "../../lib/mealTypes";
import type { MealFormState } from "./mealFormUtils";
import { messages } from "@shared/i18n/uk";
import { choiceItemClass, choiceRowClass } from "./choiceClasses";

interface MealTypePickerProps {
  mealType: MealTypeId;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function MealTypePicker({ mealType, setForm }: MealTypePickerProps) {
  return (
    <div className="mb-4">
      <SectionHeading as="div" size="xs" className="mb-1">
        {messages.nutrition.mealType}
      </SectionHeading>
      <div className={choiceRowClass}>
        {MEAL_TYPES.map((mt) => (
          <button
            key={mt.id}
            type="button"
            aria-pressed={mealType === mt.id}
            onClick={() => setForm((s) => ({ ...s, mealType: mt.id }))}
            className={choiceItemClass(mealType === mt.id)}
          >
            {mt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
