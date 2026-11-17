/**
 * Last validated: 2026-10-23
 * Status: Active
 */
const CATS_SEPARATOR = "#";

/**
 * Ключ ініціалізації аркуша ручного запису: зміна ключа на відкритому аркуші
 * перезапускає скид форми в `ManualExpenseSheet`. Частина після `#` - id
 * частих категорій через кому: вони можуть доїхати вже після відкриття.
 */
export function manualExpenseOpenKey(
  open: boolean,
  parts: ReadonlyArray<string | number | null | undefined>,
  frequentCategoryIdsKey: string,
): string {
  if (!open) return "";
  const base = parts.map((p) => (p == null ? "" : String(p))).join("|");
  return `${base}${CATS_SEPARATOR}${frequentCategoryIdsKey}`;
}

/**
 * Між двома ключами відкритого аркуша змінились лише часті категорії. Тоді
 * заповнену форму (зокрема відновлену чернетку під замком, sec-13) не
 * скидаємо: пізні категорії впливають лише на дефолт порожньої форми.
 */
export function onlyFrequentCategoriesChanged(
  prevKey: string,
  nextKey: string,
): boolean {
  if (!prevKey || !nextKey) return false;
  const base = (k: string) => k.slice(0, k.lastIndexOf(CATS_SEPARATOR));
  return base(prevKey) === base(nextKey);
}
