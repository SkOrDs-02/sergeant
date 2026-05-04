/**
 * Pure-helpers для списку покупок (без `localStorage` / `window`).
 *
 * `apps/web/src/modules/nutrition/lib/shoppingListStorage.ts` лишається
 * тонким I/O-адаптером, який бере `createModuleStorage` і ці помічники.
 */

export const SHOPPING_LIST_KEY = "nutrition_shopping_list_v1";

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  note: string;
  checked: boolean;
}

export interface ShoppingCategory {
  name: string;
  items: ShoppingItem[];
}

export interface ShoppingList {
  categories: ShoppingCategory[];
}

export interface ShoppingListLike {
  categories?: Array<{ name?: string; items?: Array<Partial<ShoppingItem>> }>;
}

function normalizeItemKey(name: unknown): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeItemId(): string {
  return `si_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeItem(raw: unknown, seenIds: Set<string>): ShoppingItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const itemName = String(r.name || "").trim();
  if (!itemName) return null;
  let id = r.id != null ? String(r.id).trim() : "";
  if (!id || seenIds.has(id)) id = makeItemId();
  while (seenIds.has(id)) id = makeItemId();
  seenIds.add(id);
  return {
    id,
    name: itemName,
    quantity: String(r.quantity || "").trim(),
    note: String(r.note || "").trim(),
    checked: Boolean(r.checked),
  };
}

function mergeItem(existing: ShoppingItem, next: ShoppingItem): ShoppingItem {
  return {
    ...existing,
    quantity: existing.quantity || next.quantity,
    note: existing.note || next.note,
    checked: existing.checked || next.checked,
  };
}

interface CategoryBucket {
  name: string;
  items: ShoppingItem[];
  byKey: Map<string, number>;
}

export function normalizeShoppingList(raw: unknown): ShoppingList {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rawCategories = Array.isArray(obj.categories)
    ? (obj.categories as unknown[])
    : [];
  const seenIds = new Set<string>();
  const byCategory = new Map<string, CategoryBucket>();

  for (const cat of rawCategories) {
    if (!cat || typeof cat !== "object") continue;
    const c = cat as Record<string, unknown>;
    const name = String(c.name || "Інше").trim() || "Інше";
    const rawItems = Array.isArray(c.items) ? (c.items as unknown[]) : [];

    const bucket: CategoryBucket = byCategory.get(name) || {
      name,
      items: [],
      byKey: new Map<string, number>(),
    };
    for (const rawItem of rawItems) {
      const item = sanitizeItem(rawItem, seenIds);
      if (!item) continue;
      const key = normalizeItemKey(item.name);
      const existingIdx = bucket.byKey.get(key);
      if (existingIdx == null) {
        bucket.byKey.set(key, bucket.items.length);
        bucket.items.push(item);
      } else {
        // `existingIdx` прийшов з `bucket.byKey.get(key)` — Map тримає
        // тільки валідні `bucket.items` indices (перевірено вище через
        // `bucket.byKey.set(key, bucket.items.length)` перед push-ом),
        // тому `bucket.items[existingIdx]` гарантовано не undefined.
        bucket.items[existingIdx] = mergeItem(bucket.items[existingIdx]!, item);
      }
    }
    if (bucket.items.length > 0) {
      byCategory.set(name, bucket);
    }
  }

  const categories: ShoppingCategory[] = [];
  for (const { name, items } of byCategory.values()) {
    if (items.length === 0) continue;
    categories.push({ name, items });
  }
  return { categories };
}

export function toggleShoppingItem(
  list: ShoppingListLike | null | undefined,
  categoryName: string,
  itemId: string,
): ShoppingList {
  const categories = (list?.categories || []).map((cat) => {
    if (cat.name !== categoryName) return cat as ShoppingCategory;
    return {
      ...(cat as ShoppingCategory),
      items: (cat.items || []).map((item) =>
        item.id === itemId
          ? { ...(item as ShoppingItem), checked: !item.checked }
          : (item as ShoppingItem),
      ),
    };
  });
  return { ...(list as ShoppingList), categories };
}

export function removeCheckedItems(
  list: ShoppingListLike | null | undefined,
): ShoppingList {
  const categories = (list?.categories || [])
    .map((cat) => ({
      ...(cat as ShoppingCategory),
      items: (cat.items || []).filter(
        (item) => !item.checked,
      ) as ShoppingItem[],
    }))
    .filter((cat) => cat.items.length > 0);
  return { ...(list as ShoppingList), categories };
}

export function getCheckedItems(
  list: ShoppingListLike | null | undefined,
): ShoppingItem[] {
  const items: ShoppingItem[] = [];
  for (const cat of list?.categories || []) {
    for (const item of cat.items || []) {
      if (item.checked) items.push(item as ShoppingItem);
    }
  }
  return items;
}

export function getTotalCount(list: ShoppingListLike | null | undefined): {
  total: number;
  checked: number;
} {
  let total = 0;
  let checked = 0;
  for (const cat of list?.categories || []) {
    for (const item of cat.items || []) {
      total++;
      if (item.checked) checked++;
    }
  }
  return { total, checked };
}
