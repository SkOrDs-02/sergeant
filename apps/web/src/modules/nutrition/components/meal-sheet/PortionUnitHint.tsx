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
    <div className="mb-3 rounded-2xl border border-line bg-panelHi px-3 py-2">
      <p className="text-style-body text-muted">{copy.body}</p>
      <button
        type="button"
        onClick={onSwitchToPackage}
        className="min-h-11 text-style-caption text-nutrition-strong dark:text-nutrition underline underline-offset-2"
      >
        {copy.packageCta}
      </button>
    </div>
  );
}
