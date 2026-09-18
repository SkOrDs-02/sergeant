/**
 * Pure-helpers для списку покупок (без `localStorage` / `window`).
 *
 * `apps/web/src/modules/nutrition/lib/shoppingListStorage.ts` лишається
 * тонким I/O-адаптером, який бере `createModuleStorage` і ці помічники.
 */

export const SHOPPING_LIST_KEY = "nutrition_shopping_list_v1";

/**
 * Походження позиції. `"manual"` — людина дописала позицію сама
 * (`addManualShoppingItem`); `"ai"` — прийшла з генерації
 * (рецепти/тижневий план). Відсутнє поле (легасі-записи до цієї фічі)
 * трактується як `"ai"` скрізь, де походження впливає на поведінку —
 * див. `mergeGeneratedShoppingList`.
 */
export type ShoppingItemSource = "manual" | "ai";

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string;
  note: string;
  checked: boolean;
  source?: ShoppingItemSource;
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
  return `si_${Date.now()}_${crypto.randomUUID()}`;
}

function sanitizeItem(raw: unknown, seenIds: Set<string>): ShoppingItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const itemName = String(r["name"] || "").trim();
  if (!itemName) return null;
  let id = r["id"] != null ? String(r["id"]).trim() : "";
  if (!id || seenIds.has(id)) id = makeItemId();
  while (seenIds.has(id)) id = makeItemId();
  seenIds.add(id);
  const rawSource = r["source"];
  const source: ShoppingItemSource | undefined =
    rawSource === "manual" ? "manual" : rawSource === "ai" ? "ai" : undefined;
  return {
    id,
    name: itemName,
    quantity: String(r["quantity"] || "").trim(),
    note: String(r["note"] || "").trim(),
    checked: Boolean(r["checked"]),
    // `exactOptionalPropertyTypes: true` (Hard Rule #19) rejects an explicit
    // `source: undefined` — conditional spread keeps the key absent instead
    // of present-but-undefined for legacy items that never had it.
    ...(source ? { source } : {}),
  };
}

function mergeItem(existing: ShoppingItem, next: ShoppingItem): ShoppingItem {
  // Ручна позиція має пережити мердж із будь-якою іншою (в т.ч. з
  // однойменною AI-позицією регенерації) — інакше `mergeGeneratedShoppingList`
  // ризикує тихо "розманити" щойно дописане людиною.
  const source: ShoppingItemSource | undefined =
    existing.source === "manual" || next.source === "manual"
      ? "manual"
      : (existing.source ?? next.source);
  return {
    ...existing,
    quantity: existing.quantity || next.quantity,
    note: existing.note || next.note,
    checked: existing.checked || next.checked,
    ...(source ? { source } : {}),
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
  const rawCategories = Array.isArray(obj["categories"])
    ? (obj["categories"] as unknown[])
    : [];
  const seenIds = new Set<string>();
  const byCategory = new Map<string, CategoryBucket>();

  for (const cat of rawCategories) {
    if (!cat || typeof cat !== "object") continue;
    const c = cat as Record<string, unknown>;
    const name = String(c["name"] || "Інше").trim() || "Інше";
    const rawItems = Array.isArray(c["items"]) ? (c["items"] as unknown[]) : [];

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

const DEFAULT_MANUAL_CATEGORY = "Інше";

export interface AddShoppingItemInput {
  name: string;
  quantity?: string;
  note?: string;
  category?: string;
}

/**
 * Додає одну ручну позицію в список. Дедуп і санітизація йдуть через
 * `normalizeShoppingList` (та сама логіка, що й для AI-списку) — тут лише
 * складаємо вхідний shape і позначаємо походження `"manual"`, щоб позиція
 * пережила наступну регенерацію (`mergeGeneratedShoppingList`).
 */
export function addManualShoppingItem(
  list: ShoppingListLike | null | undefined,
  input: AddShoppingItemInput,
): ShoppingList {
  const name = String(input.name || "").trim();
  if (!name) return normalizeShoppingList(list);
  const categoryName =
    String(input.category || "").trim() || DEFAULT_MANUAL_CATEGORY;
  const base = normalizeShoppingList(list);
  const newCategory = {
    name: categoryName,
    items: [
      {
        name,
        quantity: String(input.quantity || "").trim(),
        note: String(input.note || "").trim(),
        checked: false,
        source: "manual" as const,
      },
    ],
  };
  return normalizeShoppingList({
    categories: [...base.categories, newCategory],
  });
}

/**
 * Регенерація AI-списку (рецепти/тижневий план) НЕ стирає ручні позиції.
 * До 2026-09 `setGeneratedList` повністю перезаписував список — ручна
 * позиція, дописана людиною, зникала на наступній генерації. Тут
 * генерований набір позначається `source: "ai"`, ручні позиції з
 * поточного списку виживають повз нього, а фінальний дедуп/merge — той
 * самий `normalizeShoppingList`, що й скрізь (Hard Rule: не дублюй
 * арифметику дедупу).
 */
export function mergeGeneratedShoppingList(
  current: ShoppingListLike | null | undefined,
  generatedCategories: unknown,
): ShoppingList {
  const currentNormalized = normalizeShoppingList(current);
  const manualCategories = currentNormalized.categories
    .map((cat) => ({
      name: cat.name,
      items: cat.items.filter((item) => item.source === "manual"),
    }))
    .filter((cat) => cat.items.length > 0);

  const generatedRaw = Array.isArray(generatedCategories)
    ? generatedCategories
    : [];
  const generatedNormalized = normalizeShoppingList({
    categories: generatedRaw,
  }).categories.map((cat) => ({
    name: cat.name,
    items: cat.items.map((item) => ({
      ...item,
      source: item.source ?? ("ai" as const),
    })),
  }));

  return normalizeShoppingList({
    categories: [...generatedNormalized, ...manualCategories],
  });
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
