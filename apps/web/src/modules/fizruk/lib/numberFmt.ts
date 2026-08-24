/**
 * Last validated: 2026-08-24
 * Status: Active
 *
 * Числа Фізрука для ЕКРАНА — одним роздільником на весь модуль.
 *
 * AI-DANGER: тут навмисно НЕ `toFixed()`. `toFixed` завжди друкує крапку,
 * незалежно від локалі, і саме через нього на одній сторінці стояло
 * «102,5 кг» поруч із «92.5 / 87.5 / 2.5 кг», а «Тіло» показувало
 * «82,5 кг» там, де «Прогрес» — «82.5 кг» (браузерне QA 2026-08-23).
 * Єдиний форматер продукту — `formatNumberUk` із `@sergeant/shared`
 * (він же нормалізує роздільник розрядів); цей хелпер лише додає
 * фіксовану кількість знаків після коми і прочерк для нечисел.
 *
 * Для значень у `<input type="number">` це НЕ підходить: там потрібен
 * машинний формат із крапкою.
 */
import { formatNumberUk } from "@sergeant/shared";

export function fmt(n: number | string | null | undefined, digits = 0): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return formatNumberUk(x, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Те саме, але без хвостових нулів: «92,5», «100», «2,5».
 * Для ваг і замірів, де «100,0 кг» читається як зайва точність.
 */
export function fmtLoose(
  n: number | string | null | undefined,
  digits = 1,
): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return formatNumberUk(x, { maximumFractionDigits: digits });
}
