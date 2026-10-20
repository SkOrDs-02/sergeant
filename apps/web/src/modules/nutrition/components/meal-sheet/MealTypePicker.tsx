/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useId, type Dispatch, type SetStateAction } from "react";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { MEAL_TYPES, type MealTypeId } from "../../lib/mealTypes";
import type { MealFormState } from "./mealFormUtils";
import { messages } from "@shared/i18n/uk";

interface MealTypePickerProps {
  mealType: MealTypeId;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function MealTypePicker({ mealType, setForm }: MealTypePickerProps) {
  const labelId = useId();
  return (
    <div className="mb-4">
      <div id={labelId} className={`${FIELD_LABEL} mb-1`}>
        {messages.nutrition.mealType}
      </div>
      <ChoiceGroup
        ariaLabelledBy={labelId}
        value={mealType}
        onChange={(id) => setForm((s) => ({ ...s, mealType: id }))}
        items={MEAL_TYPES.map((mt) => ({ value: mt.id, label: mt.label }))}
      />
    </div>
  );
}
