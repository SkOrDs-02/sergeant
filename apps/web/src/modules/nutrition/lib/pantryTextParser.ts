/**
 * Last validated: 2026-06-15
 * Status: Active
 * Легасі-реекспорт pantry-text-parser з `@sergeant/nutrition-domain`.
 * Файл залишено, щоб існуючі імпорти `../lib/pantryTextParser.js` не
 * довелось переписувати всі одразу.
 *
 * Для нового коду:
 * `import { parseLoosePantryText } from "@sergeant/nutrition-domain";`
 */
export {
  normalizeFoodName,
  normalizeUnit,
  canonicalFoodKey,
  parseLoosePantryText,
} from "@sergeant/nutrition-domain";
export type { PantryItem } from "@sergeant/nutrition-domain";
