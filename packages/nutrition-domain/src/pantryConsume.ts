/**
 * Конверсія «спожитих грамів» у кількість для списання зі складської позиції,
 * вираженої в її власній одиниці (`г`/`кг` — маса 1:1, `мл`/`л` — через
 * густину, `шт` — через вагу однієї штуки).
 *
 * DOM-free доменна логіка: споживають і `apps/web`, і майбутній pantry-surface
 * `apps/mobile`. Раніше жила inline у web-хуку `useNutritionPantries` і свідомо
 * пропускала немасові одиниці (див. F15 аудиту page-audit-08-nutrition).
 *
 * AI-CONTEXT: таблиці навмисно грубі — default 1.0 г/мл для рідин і 100 г/шт
 * для штучних продуктів. Це закриває inventory-drift із F15 (раніше «2 л
 * молока» чи «10 шт яєць» не списувались узагалі), не претендуючи на
 * нутриціологічну точність. Розширюй записи лише на запит продукту щодо
 * точнішого обліку залишків, а не «про всяк випадок».
 */
import { canonicalFoodKey, normalizeUnit } from "./pantryTextParser.js";

/** Густина за замовчуванням (вода-подібна), коли продукту немає в таблиці. г/мл. */
export const DEFAULT_DENSITY_G_PER_ML = 1.0;

/** Вага однієї штуки за замовчуванням, коли продукту немає в таблиці. г. */
export const DEFAULT_PIECE_WEIGHT_G = 100;

/**
 * Груба таблиця густин (г/мл) для позицій у `мл`/`л`.
 * Ключ — `canonicalFoodKey(name)`, тож відмінкові/множинні форми
 * («молока», «олії») зводяться до канонічної форми перед пошуком.
 */
export const DENSITY_G_PER_ML: Readonly<Record<string, number>> = {
  молоко: 1.03,
  кефір: 1.03,
  ряжанка: 1.03,
  йогурт: 1.03,
  вершки: 1.01,
  олія: 0.92,
  "оливкова олія": 0.92,
  мед: 1.42,
};

/**
 * Груба таблиця ваги однієї штуки (г) для позицій у `шт`.
 * Ключ — `canonicalFoodKey(name)`.
 */
export const PIECE_WEIGHT_G: Readonly<Record<string, number>> = {
  яйце: 60,
  яблуко: 180,
  груша: 180,
  банан: 120,
  апельсин: 200,
  мандарин: 80,
  помідор: 120,
  картопля: 120,
  морква: 80,
  цибуля: 90,
  перець: 150,
  кабачок: 300,
  баклажан: 250,
};

/** Густина (г/мл) для продукту; default `DEFAULT_DENSITY_G_PER_ML`. */
export function densityFor(name: unknown): number {
  return DENSITY_G_PER_ML[canonicalFoodKey(name)] ?? DEFAULT_DENSITY_G_PER_ML;
}

/** Вага однієї штуки (г) для продукту; default `DEFAULT_PIECE_WEIGHT_G`. */
export function pieceWeightFor(name: unknown): number {
  return PIECE_WEIGHT_G[canonicalFoodKey(name)] ?? DEFAULT_PIECE_WEIGHT_G;
}

/**
 * Скільки списати з позиції в одиниці `unit`, споживши `gramsConsumed` грамів.
 *
 * - `г` → 1:1, `кг` → /1000.
 * - `мл`/`л` → ділимо на густину продукту (`л` ще /1000).
 * - `шт` → ділимо на вагу однієї штуки.
 * - відсутня одиниця → трактуємо як `г` (узгоджено з legacy-дефолтом consume).
 *
 * Повертає `null`, коли списання порахувати не можна: не-додатні/не-скінченні
 * грами, або одиниця без грубого масового відображення (напр. `уп` — пакет
 * може важити будь-що). Викликач у такому разі лишає позицію без змін.
 */
export function gramsToUnitQty(
  gramsConsumed: number,
  unit: string | null | undefined,
  name: unknown,
): number | null {
  if (!Number.isFinite(gramsConsumed) || gramsConsumed <= 0) return null;
  const u = normalizeUnit(unit) ?? "г";
  switch (u) {
    case "г":
      return gramsConsumed;
    case "кг":
      return gramsConsumed / 1000;
    case "мл":
      return gramsConsumed / densityFor(name);
    case "л":
      return gramsConsumed / densityFor(name) / 1000;
    case "шт":
      return gramsConsumed / pieceWeightFor(name);
    default:
      return null;
  }
}
