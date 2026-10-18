/**
 * AddMealSheetTitle — заголовок аркуша додавання прийому: підпис кроку
 * плюс стрілка «назад», коли з поточного кроку є куди повертатись.
 *
 * AI-CONTEXT: винесено з `AddMealSheet.tsx` не заради краси, а щоб файл
 * не впирався в `max-lines: 600` (Hard Rule #18). На 2026-08-24 він стояв
 * рівно на 600 — тобто наступний рядок будь-якої правки поклав би лінт.
 * Заголовок для цього найкращий кандидат: він залежить лише від `step` і
 * пари callback-ів, стану не має і нічого більше не знає.
 *
 * Status: Active
 * Last validated: 2026-08-24
 */
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";

const STEP_TITLES: Record<string, string> = {
  source: "Додати прийом їжі",
  photo: "Фото страви",
  package: "На 100 г",
};

const FALLBACK_TITLE = "Додати прийом їжі";

interface AddMealSheetTitleProps {
  step: string;
  editing?: boolean;
  /** Стрілка «назад» показується лише там, де backtrack справді можливий. */
  canBacktrack: boolean;
  onBacktrack: () => void;
}

export function AddMealSheetTitle({
  step,
  editing = false,
  canBacktrack,
  onBacktrack,
}: AddMealSheetTitleProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {canBacktrack && (
        <button
          type="button"
          onClick={onBacktrack}
          className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-text hover:bg-line/40 focus-ring"
          aria-label="Назад до вибору способу"
        >
          <Icon name="chevron-left" size="lg" />
        </button>
      )}
      <span className="truncate">
        {editing
          ? messages.nutrition.addMeal.editTitle
          : (STEP_TITLES[step] ?? FALLBACK_TITLE)}
      </span>
    </div>
  );
}
