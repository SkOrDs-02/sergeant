/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { useId, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { Sheet } from "@shared/components/ui/Sheet";
import { todayISODate, type MealTypeId } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";
import { MEAL_TYPES } from "../lib/mealTypes";

const copy = messages.nutrition.copyMeal;

interface CopyMealSheetProps {
  /** Прийом-джерело; `null` закриває аркуш. */
  mealType: MealTypeId | null;
  onClose: () => void;
  onCopy: (date: string, mealType: MealTypeId) => void;
}

/**
 * Копія прийому: куди (дата) і в який прийом. Безкоштовна і без входу: у 6 з 10
 * конкурентів вона відкрита, пейвол там був би кроком назад.
 */
export function CopyMealSheet({
  mealType,
  onClose,
  onCopy,
}: CopyMealSheetProps) {
  const [date, setDate] = useState(() => todayISODate());
  const [target, setTarget] = useState<MealTypeId | null>(null);
  const mealLabelId = useId();
  if (!mealType) return null;
  const chosen = target ?? mealType;

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      panelClassName="nutrition-sheet"
      zIndex={120}
    >
      <div className="mb-4">
        <div className={cn(FIELD_LABEL, "mb-1")}>{copy.dateLabel}</div>
        <DateField
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={copy.dateAria}
        />
      </div>
      <div className="mb-4">
        <div id={mealLabelId} className={cn(FIELD_LABEL, "mb-2")}>
          {copy.mealLabel}
        </div>
        <ChoiceGroup
          ariaLabelledBy={mealLabelId}
          value={chosen}
          onChange={setTarget}
          items={MEAL_TYPES.map((mt) => ({ value: mt.id, label: mt.label }))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-12 min-h-[44px]"
          disabled={!date}
          onClick={() => onCopy(date, chosen)}
        >
          {copy.submit}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 min-h-[44px]"
          onClick={onClose}
        >
          {copy.cancel}
        </Button>
      </div>
    </Sheet>
  );
}
