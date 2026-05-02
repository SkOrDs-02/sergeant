/**
 * MCC → Sergeant expense category slug mapping.
 *
 * Сервіс-сайд категоризатор для Monobank webhook handler. Джерело правди для
 * MCC-маппінгу — `@sergeant/finyk-domain/constants` (`MCC_CATEGORIES`); тут ми
 * тільки розгортаємо його у плаский `Record<number, slug>` для O(1) lookup
 * під час insert-у транзакції.
 *
 * Покриття: ~50 найпоширеніших MCC, які реально приходять з українських
 * терміналів. Невідомі MCC, `null`, та `0` → повертаємо `null`, користувач
 * сам розкладе категорію через UI.
 */
import { MCC_CATEGORIES } from "@sergeant/finyk-domain/constants";

const MCC_TO_CATEGORY: Record<number, string> = (() => {
  const map: Record<number, string> = {};
  for (const cat of MCC_CATEGORIES) {
    if (!Array.isArray(cat.mccs)) continue;
    for (const mcc of cat.mccs) {
      if (typeof mcc !== "number" || mcc <= 0) continue;
      map[mcc] = cat.id;
    }
  }
  return map;
})();

/**
 * Resolve a Monobank MCC (ISO 18245) to a Sergeant expense-category slug.
 * Returns `null` for `0`, `null`, `undefined`, or unknown codes — caller
 * stores the value as-is, allowing the user to override later via UI.
 */
export function categorizeMcc(mcc: number | null | undefined): string | null {
  if (mcc == null || mcc === 0) return null;
  return MCC_TO_CATEGORY[mcc] ?? null;
}

/**
 * Internal — exposed for the migration generator and tests. Do not import
 * from request handlers; use `categorizeMcc()` instead so the lookup stays
 * inlined.
 */
export function getMccToCategoryMap(): Readonly<Record<number, string>> {
  return MCC_TO_CATEGORY;
}
