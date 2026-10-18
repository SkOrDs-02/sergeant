/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Підпис одиниці для ручного запису без продукту й без фото.
 *
 * Одиниця мусить бути підписана: без джерела поля КБЖВ означають «за всю
 * порцію», а людина з упаковкою в руках за замовчуванням читає етикетку —
 * тобто на 100 г. Кнопка веде на крок «маю етикетку», де ввід саме на 100 г.
 */
import { messages } from "@shared/i18n/uk";

interface PortionUnitHintProps {
  onSwitchToPackage: () => void;
}

export function PortionUnitHint({ onSwitchToPackage }: PortionUnitHintProps) {
  const copy = messages.nutrition.portionUnitHint;
  return (
    <div className="mb-3 border-y border-line py-2">
      <p className="text-style-label text-muted">{copy.body}</p>
      <button
        type="button"
        onClick={onSwitchToPackage}
        className="min-h-11 rounded-lg text-style-label font-semibold text-text underline underline-offset-2 focus-ring"
      >
        {copy.packageCta}
      </button>
    </div>
  );
}
