/**
 * Запас у двох вимірах: що є (позиція) і де воно лежить (місце).
 *
 * AI-CONTEXT: місце — це та сама комора (`nutrition_pantries`), лише
 * переосмислена. Нової схеми немає й не треба: позиція вже належить одному
 * місцю через `pantry_id`. Тут живе рівно те, чого бракувало — плаский
 * погляд на ВСІ місця разом і правила, за якими позиція в місце потрапляє.
 *
 * Ключовий інваріант: **ручний вибір сильніший за автовизначення**.
 * `resolvePlaceForItem` спершу шукає позицію серед уже розкладених і
 * повертає її фактичне місце; вгадування вмикається лише для того, чого в
 * коморі ще немає. Без цього доливання «молока» щоразу тягло б позицію
 * назад у холодильник, хоч людина й перенесла її на балкон.
 */
import { mergeItems } from "./mergeItems.js";
import { placeForFood } from "./foodCategories.js";
import { DEFAULT_PLACE_ID } from "./nutritionPantries.js";
import { matchFoodName, type PantryItem } from "./pantryTextParser.js";
import type { Pantry } from "./nutritionTypes.js";

export interface PlacedPantryItem extends PantryItem {
  /** Місце, якому позиція належить. */
  pantryId: string;
  /** Індекс усередині свого місця — адреса для мутації. */
  localIdx: number;
}

/**
 * Усі позиції всіх місць одним списком. Порядок — порядок місць у масиві,
 * і він же стає глобальним індексом, яким адресують мутації UI.
 */
export function buildPlacedItems(
  pantries: readonly Pantry[] | null | undefined,
): PlacedPantryItem[] {
  const out: PlacedPantryItem[] = [];
  for (const p of Array.isArray(pantries) ? pantries : []) {
    const items: readonly PantryItem[] = Array.isArray(p.items) ? p.items : [];
    items.forEach((item, localIdx) => {
      out.push({ ...item, pantryId: p.id, localIdx });
    });
  }
  return out;
}

/**
 * Знімає адресу місця з позицій перед відправкою назовні. Місце — це
 * внутрішня адреса для мутацій UI; у payload серверних промптів воно
 * лише шум, який моделі нема куди подіти.
 */
export function stripPlacement(items: readonly PantryItem[]): PantryItem[] {
  return items.map((item) => {
    const { pantryId: _p, localIdx: _i, ...rest } = item as PlacedPantryItem;
    return rest as PantryItem;
  });
}

/** Куди класти позицію: де вона вже лежить, інакше — вгадане місце. */
export function resolvePlaceForItem(
  placed: readonly PlacedPantryItem[],
  name: unknown,
): string {
  const key = matchFoodName(name);
  if (key) {
    const existing = placed.find((x) => matchFoodName(x.name) === key);
    if (existing) return existing.pantryId;
  }
  return placeForFood(name);
}

function withItems(p: Pantry, items: PantryItem[]): Pantry {
  return { ...p, items };
}

/**
 * Розкладає набір позицій по місцях і зливає кожну групу в її місце.
 * Одна позиція лежить в одному місці — тому спершу групування, і лише
 * потім `mergeItems` усередині кожної групи.
 */
export function mergeItemsIntoPlaces(
  pantries: readonly Pantry[],
  items: readonly PantryItem[],
  placeOf: (name: unknown) => string,
): Pantry[] {
  const byPlace = new Map<string, PantryItem[]>();
  for (const item of items) {
    const id = placeOf(item?.name) || DEFAULT_PLACE_ID;
    const bucket = byPlace.get(id);
    if (bucket) bucket.push(item);
    else byPlace.set(id, [item]);
  }
  if (byPlace.size === 0) return [...pantries];

  const out = pantries.map((p) => {
    const incoming = byPlace.get(p.id);
    if (!incoming) return p;
    byPlace.delete(p.id);
    return withItems(p, mergeItems(p.items, incoming));
  });
  // Місце, якого немає (людина видалила власне) — позиції не губимо,
  // вони їдуть у дефолтне місце, а не в неіснуючий id.
  const orphans = [...byPlace.values()].flat();
  if (orphans.length === 0) return out;
  const fallbackIdx = out.findIndex((p) => p.id === DEFAULT_PLACE_ID);
  if (fallbackIdx < 0) return out;
  const fallback = out[fallbackIdx]!;
  out[fallbackIdx] = withItems(fallback, mergeItems(fallback.items, orphans));
  return out;
}

/** Переносить одну позицію в інше місце. Порожній результат = no-op. */
export function movePantryItem(
  pantries: readonly Pantry[],
  from: { pantryId: string; localIdx: number },
  targetId: string,
): { pantries: Pantry[]; moved: PantryItem | null } {
  if (from.pantryId === targetId)
    return { pantries: [...pantries], moved: null };
  let moved: PantryItem | null = null;
  const stripped = pantries.map((p) => {
    if (p.id !== from.pantryId) return p;
    const items = Array.isArray(p.items) ? [...p.items] : [];
    moved = items.splice(from.localIdx, 1)[0] ?? null;
    return withItems(p, items);
  });
  if (moved === null) return { pantries: [...pantries], moved: null };
  const target = stripped.find((p) => p.id === targetId);
  if (!target) return { pantries: [...pantries], moved: null };
  return {
    pantries: stripped.map((p) =>
      p.id === targetId ? withItems(p, mergeItems(p.items, [moved!])) : p,
    ),
    moved,
  };
}

export interface RedistributeMove {
  name: string;
  fromId: string;
  toId: string;
}

/**
 * Що саме переїде, якщо натиснути «розкласти по місцях». Список існує не
 * для краси: ADR-0077 робить комору журналом, тож масовий переїзд — подія
 * історії, і людина має побачити її ДО того, як вона станеться.
 */
export function planRedistribution(
  pantries: readonly Pantry[],
): RedistributeMove[] {
  const out: RedistributeMove[] = [];
  const known = new Set(pantries.map((p) => p.id));
  for (const item of buildPlacedItems(pantries)) {
    const toId = placeForFood(item.name);
    if (toId === item.pantryId || !known.has(toId)) continue;
    out.push({ name: String(item.name || ""), fromId: item.pantryId, toId });
  }
  return out;
}

/** Виконує рівно те, що показав `planRedistribution`. */
export function redistributePantries(pantries: readonly Pantry[]): Pantry[] {
  const known = new Set(pantries.map((p) => p.id));
  const staying = new Map<string, PantryItem[]>();
  const moving: PantryItem[] = [];
  const target = new Map<string, string>();

  for (const p of pantries) staying.set(p.id, []);
  for (const item of buildPlacedItems(pantries)) {
    const { pantryId, localIdx: _localIdx, ...rest } = item;
    const toId = placeForFood(item.name);
    if (toId === pantryId || !known.has(toId)) {
      staying.get(pantryId)?.push(rest);
      continue;
    }
    target.set(matchFoodName(item.name), toId);
    moving.push(rest);
  }

  const stripped = pantries.map((p) => withItems(p, staying.get(p.id) ?? []));
  return mergeItemsIntoPlaces(
    stripped,
    moving,
    (name) => target.get(matchFoodName(name)) ?? placeForFood(name),
  );
}
