/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { DateField } from "@shared/components/ui/DateField";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { todayISODate, type MealTypeId } from "@sergeant/nutrition-domain";
import { MEAL_TYPES } from "../lib/mealTypes";

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
      title="Скопіювати прийом"
      description="Записи з цього прийому ляжуть у вибраний день і прийом."
      panelClassName="nutrition-sheet"
      zIndex={120}
    >
      <div className="mb-4">
        <SectionHeading as="div" size="xs" variant="nutrition" className="mb-1">
          Дата
        </SectionHeading>
        <DateField
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Дата копії"
        />
      </div>
      <div className="mb-4">
        <SectionHeading as="div" size="xs" variant="nutrition" className="mb-2">
          Прийом
        </SectionHeading>
        <div className="flex gap-2 flex-wrap">
          {MEAL_TYPES.map((mt) => (
            <button
              key={mt.id}
              type="button"
              aria-pressed={chosen === mt.id}
              onClick={() => setTarget(mt.id)}
              className={cn(
                "text-style-label px-3 py-1.5 min-h-[44px] rounded-xl border inline-flex items-center gap-1.5",
                chosen === mt.id
                  ? "bg-nutrition-strong text-white border-nutrition dark:bg-nutrition dark:text-bg"
                  : "bg-panelHi text-muted border-line hover:border-nutrition/50",
              )}
            >
              <Icon name={mt.iconName as IconName} size="sm" aria-hidden />
              {mt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          type="button"
          className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover dark:bg-nutrition dark:text-bg dark:hover:bg-nutrition/90"
          disabled={!date}
          onClick={() => onCopy(date, chosen)}
        >
          Скопіювати
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 min-h-[44px]"
          onClick={onClose}
        >
          Скасувати
        </Button>
      </div>
    </Sheet>
  );
}
