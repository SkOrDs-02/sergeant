/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
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
        <SectionHeading as="div" size="xs" className="mb-1">
          {copy.dateLabel}
        </SectionHeading>
        <DateField
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label={copy.dateAria}
        />
      </div>
      <div className="mb-4">
        <SectionHeading as="div" size="xs" className="mb-2">
          {copy.mealLabel}
        </SectionHeading>
        <div className="flex gap-2 flex-wrap">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt.id}
              type="button"
              aria-pressed={chosen === mt.id}
              onClick={() => setTarget(mt.id)}
              className={cn(
                "text-style-label px-3 py-1.5 min-h-[44px] rounded-lg border border-border-strong focus-ring",
                chosen === mt.id
                  ? "bg-line/60 text-text font-semibold"
                  : "text-muted hover:bg-line/40",
              )}
            >
              {mt.label}
            </button>
          ))}
        </div>
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
