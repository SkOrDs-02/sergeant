/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { ChoiceCheckbox } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n/uk";

const copy = messages.nutrition.addMeal;

/** Позначка «Запамʼятати для повтору» на кроці «fill» (нові записи). */
export function RememberForRepeat({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="mt-4 border-y border-line py-1">
      <ChoiceCheckbox
        checked={checked}
        onChange={onChange}
        label={
          <span className="text-style-body font-semibold">
            {copy.rememberForRepeat}
          </span>
        }
        description={copy.rememberForRepeatHint}
      />
    </div>
  );
}
