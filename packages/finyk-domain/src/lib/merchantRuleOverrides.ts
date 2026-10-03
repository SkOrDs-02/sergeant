/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Правила мерчантів у вигляді мапи «операція → категорія» для АГРЕГАТОРІВ.
 *
 * Навіщо. Резолвер (`getExpenseCategoryForTransaction`) бере правило 4-м
 * аргументом, але категорії по операціях рахують і десятки агрегаторів
 * (`calcCategorySpent`, ліміти, прогноз, тижневий звіт, дайджест, чат-контекст),
 * і кожен із них отримує категорію ОДНИМ способом — `txCategories[tx.id]`.
 * Протягувати четвертий аргумент крізь усі ці місця означало б дописати
 * його в кожну сигнатуру й гарантовано десь забути; тоді список показує
 * «Продукти», а ліміт рахує «Кафе» — той самий клас розбіжності, що канон
 * вважає багом. Натомість хаб, який уже тримає і операції, і явні override-и,
 * один раз будує ЕФЕКТИВНУ мапу і передає її туди, куди раніше передавав
 * `txCategories`.
 *
 * AI-DANGER: ефективна мапа — ЛИШЕ ДЛЯ ЧИТАННЯ агрегаторами. Її не можна
 * класти в слот `txCategories` і не можна віддавати в запис: dual-write
 * вважає кожен запис мапи явним вибором людини й збереже виведені правилом
 * записи як справжні override-и — тоді видалення правила їх уже не зніме.
 * Явні override-и (`finyk_tx_categories`) і правила живуть окремо навмисно.
 */

import type { TxCategoriesMap } from "../domain/types.js";
import { getMerchantRuleCategoryId } from "./categories.js";
import {
  merchantRuleKindOf,
  type MerchantRuleIndex,
  type MerchantRuleTxLike,
} from "./merchantRules.js";

/**
 * `txCategories` + виведені правилами записи для банківських операцій без
 * явного override-а.
 *
 * Тотожність зберігається: якщо правил немає або жодне не спрацювало,
 * повертається САМЕ `txCategories` — React-залежності `useMemo`, що стоять на
 * цій мапі, не перераховуються без причини.
 */
export function withMerchantRuleOverrides(
  transactions: readonly (MerchantRuleTxLike & { id: string })[],
  txCategories: TxCategoriesMap,
  merchantRules: MerchantRuleIndex | null | undefined,
  customCategories: readonly unknown[] = [],
): TxCategoriesMap {
  if (!merchantRules || merchantRules.size === 0) return txCategories;
  let derived: TxCategoriesMap | null = null;
  for (const tx of transactions) {
    if (!tx || typeof tx.id !== "string" || !tx.id) continue;
    if (txCategories[tx.id]) continue;
    const kind = merchantRuleKindOf(tx);
    if (!kind) continue;
    const categoryId = getMerchantRuleCategoryId(
      tx,
      merchantRules,
      kind,
      customCategories,
    );
    if (!categoryId) continue;
    if (!derived) derived = { ...txCategories };
    derived[tx.id] = categoryId;
  }
  return derived ?? txCategories;
}
