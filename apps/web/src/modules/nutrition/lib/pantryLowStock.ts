/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * Re-export заради зворотної сумісності. Логіка (поріг + `isPantryItemLowStock`)
 * переїхала в DOM-free `@sergeant/nutrition-domain/pantryLowStock.ts` — рівень 1
 * списку покупок (`shoppingListPantryMath.ts`) реюзить рівно той самий поріг
 * для `mergeLowStockIntoList`, і дублювати таблицю в `apps/web` означало б два
 * джерела правди, що можуть розійтись. Не редагуй пороги тут — редагуй у пакеті.
 */
export {
  LOW_STOCK_THRESHOLD_BY_UNIT,
  isPantryItemLowStock,
} from "@sergeant/nutrition-domain";
