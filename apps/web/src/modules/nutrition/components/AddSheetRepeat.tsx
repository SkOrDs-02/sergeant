/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Повтор звичної їжі прямо в аркуші «Додати» з кнопки в куті (OD-27 Х-3 а,
 * рішення власника 2026-11-18), над джерелами: рядок «Як учора» і до трьох
 * чипів «Нещодавні». Кожен записує одним тапом і закриває аркуш; тост
 * («Скасувати») дає той, хто пише (`useCopyYesterdayMeals`,
 * `useQuickAddMealFromChip`). Порожній блок не рендериться.
 *
 * Чипи ті самі, що в кроці «Джерело» форми прийому (`QuickAddChips`).
 */
import { clampNonNegative } from "@sergeant/shared";
import type { Meal } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";
import type { QuickChip } from "../hooks/useNutritionQuickChips";
import { QuickAddChips } from "./QuickAddChips";

/** Скільки чипів уміщає аркуш над джерелами (кадр власника nut-3-a). */
const MAX_CHIPS = 3;

interface AddSheetRepeatProps {
  yesterdayMeals: readonly Meal[];
  onCopyYesterday: () => void;
  chips: readonly QuickChip[];
  onQuickAdd: (chip: QuickChip) => void;
  /** Закрити аркуш «Додати» після запису. */
  onDone: () => void;
}

export function AddSheetRepeat({
  yesterdayMeals,
  onCopyYesterday,
  chips,
  onQuickAdd,
  onDone,
}: AddSheetRepeatProps) {
  const shown = chips.slice(0, MAX_CHIPS);
  if (yesterdayMeals.length === 0 && shown.length === 0) return null;
  const copy = messages.nutrition.repeat;
  const kcal = Math.round(
    yesterdayMeals.reduce((s, m) => s + clampNonNegative(m?.macros?.kcal), 0),
  );
  const names = yesterdayMeals.map((m) => m.name).join(", ");
  return (
    <div className="divide-y divide-line border-t border-line">
      {yesterdayMeals.length > 0 && (
        <button
          type="button"
          className="flex min-h-14 w-full flex-col justify-center py-2 text-left focus-ring"
          onClick={() => {
            onDone();
            onCopyYesterday();
          }}
        >
          <span className="text-style-label-lg font-semibold text-text">
            {copy.yesterday}
          </span>
          {/* Один рядок: довгий список страв не штовхає джерела за край
              аркуша на 390 × 844. */}
          <span className="mt-0.5 w-full truncate text-style-label text-muted">
            {copy.yesterdayHint
              .replace("{names}", names)
              .replace("{kcal}", String(kcal))}
          </span>
        </button>
      )}
      {shown.length > 0 && (
        <div className="py-3">
          <div className="mb-2 text-style-label font-semibold text-text">
            {copy.recent}
          </div>
          <QuickAddChips
            chips={shown}
            onTap={(chip) => {
              onDone();
              onQuickAdd(chip);
            }}
          />
        </div>
      )}
    </div>
  );
}
