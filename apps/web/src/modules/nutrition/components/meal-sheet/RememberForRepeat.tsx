/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";

const copy = messages.nutrition.addMeal;

/** Чекбокс «Запамʼятати для повтору» на кроці «fill» (нові записи). */
export function RememberForRepeat({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panelHi p-3">
      <input
        type="checkbox"
        aria-label={copy.rememberForRepeat}
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-nutrition-strong"
      />
      <span className="min-w-0">
        <span className="block text-style-label text-text">
          {copy.rememberForRepeat}
        </span>
        {/* AI-NOTE: кегль тут навмисний — це підказка під
            контролом («Запамʼятати для повтору»), а не текст,
            який читають окремо; `text-style-body` зрівняв би
            її з підписом самого чекбокса. */}
        <span className="mt-0.5 block text-style-caption text-muted">
          {copy.rememberForRepeatHint}
        </span>
      </span>
    </label>
  );
}
