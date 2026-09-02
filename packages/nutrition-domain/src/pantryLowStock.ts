/**
 * Мінімальний low-stock сигнал для комори (Silpo integration трек C, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` § «Комора —
 * через готовий ledger»: «Low-stock додається як наслідок»).
 *
 * AI-CONTEXT: залишок УЖЕ обчислюваний дешево — `qty` на позиції комори
 * (`PantryItem`) є авторитетним джерелом для UI. Кожен мутатор
 * `useNutritionPantries.ts` тримає його синхронним із append-only
 * ledger-подіями (`replenish`/`consume`/`adjust`) — самé зчитування O(1),
 * рахувати нема чого. Тому це НЕ "вигадана модель залишку": модель уже
 * існує, тут лише поріг.
 *
 * Чого тут НЕМА і чому: `PantryItem` не несе per-item "цільового" рівня
 * (par level) — жодного поля `parQty`/`threshold` у моделі. Нижче — один
 * ГЛОБАЛЬНИЙ статичний поріг на нормалізовану одиницю виміру
 * (`normalizeUnit`), v1-евристика для "майже нуль", а не продуктове
 * рішення "скільки тобі нормально тримати вдома". Продуктова примітка: якщо
 * founder захоче per-item пороги — окреме продуктове рішення (нове поле
 * в `PantryManagerSheet`/`PantryItem` + міграція SQLite-дзеркала), не
 * розширення цієї евристики.
 *
 * Rівень 1 списку покупок (`shoppingListPantryMath.ts`) реюзить рівно цей
 * поріг для `mergeLowStockIntoList` — тому файл живе тут, у DOM-free
 * `@sergeant/nutrition-domain`, а не в `apps/web`. `apps/web`-модуль
 * (`apps/web/src/modules/nutrition/lib/pantryLowStock.ts`) лишається
 * тонким re-export-ом заради зворотної сумісності імпортів.
 */
/**
 * Пороги "закінчується" за нормалізованою одиницею виміру. Одиниці поза
 * списком (`уп`, довільний текст із `normalizeUnit`) сигналу не несуть —
 * без побутової семантики "скільки це на практиці" будь-яке число тут
 * було б довільним.
 */
export const LOW_STOCK_THRESHOLD_BY_UNIT: Readonly<Record<string, number>> = {
  г: 100,
  кг: 0.2,
  мл: 200,
  л: 0.2,
  шт: 1,
};

/**
 * `true`, коли залишок позиції — додатне число не вище порога її одиниці.
 * `qty <= 0` навмисно НЕ рахується "low stock" — це або вже прибрана
 * позиція, або сигнал подвійного списання (ADR-0077 audit E-2), не
 * "скоро закінчиться".
 */
export function isPantryItemLowStock(item: {
  qty?: number | null | undefined;
  unit?: string | null | undefined;
}): boolean {
  if (item.qty == null || !Number.isFinite(item.qty)) return false;
  if (item.qty <= 0) return false;
  const threshold = LOW_STOCK_THRESHOLD_BY_UNIT[item.unit ?? ""];
  if (threshold == null) return false;
  return item.qty <= threshold;
}
