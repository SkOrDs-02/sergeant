/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * «У кошик Сільпо» зі списку покупок (Silpo integration трек G, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Cart (MCP write path)»). Джерело позицій — невідмічені (`checked: false`)
 * рядки поточного `ShoppingList`: відмічене вже куплено, тож у кошик його
 * пропонувати нема сенсу.
 */
import type { ShoppingList } from "@sergeant/nutrition-domain";

export interface SilpoCartSourceItem {
  name: string;
  quantity?: number;
}

/**
 * Розпарсити «кількість» рядка списку покупок у число для `cartPreview()`.
 *
 * Навмисно суворо: `quantity` у списку покупок — це часто маса/обʼєм
 * інгредієнта ("500 г", "2 ст.л."), а не кількість товарних позицій
 * каталогу Сільпо. Підставити "500" як `quantity` кошика означало б
 * попросити Сільпо додати 500 упаковок — тиха хибна кількість гірша за
 * відсутню. Тому рахуємо лише рядок, що є ЧИСТИМ числом (без одиниці):
 * "2" → 2, "500 г" → `undefined` (сторона, що показує степер, підставить
 * дефолт 1 сама).
 */
export function parseLeadingQuantity(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!/^\d+([.,]\d+)?$/.test(trimmed)) return undefined;
  const n = Number(trimmed.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Невідмічені позиції списку покупок — вхід для `POST /api/silpo/cart/preview`. */
export function collectUncheckedShoppingItems(
  shoppingList: ShoppingList | null | undefined,
): SilpoCartSourceItem[] {
  if (!shoppingList) return [];
  const out: SilpoCartSourceItem[] = [];
  for (const category of shoppingList.categories) {
    for (const item of category.items) {
      if (item.checked) continue;
      const name = (item.name ?? "").trim();
      if (!name) continue;
      const quantity = parseLeadingQuantity(item.quantity ?? "");
      out.push(quantity != null ? { name, quantity } : { name });
    }
  }
  return out;
}
