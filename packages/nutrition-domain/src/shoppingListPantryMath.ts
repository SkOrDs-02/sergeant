/**
 * «Рівень 1» списку покупок (детермінований, без AI) — спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md`, рішення founder-а
 * 2026-08-18 «роби рівень 1 потім»: трек G (кошик Сільпо) закрито, це
 * наступний крок поверх ВЖЕ згенерованого AI списку.
 *
 * Дві чисті операції над `ShoppingList`, обидві DOM-free (без `localStorage`
 * / `window` / LLM-виклику):
 *
 *   1. {@link applyPantryToShoppingList} — точне віднімання залишків комори
 *      від кожної позиції списку за нормалізованою назвою (`canonicalFoodKey`,
 *      той самий ключ, яким трек C мапить назви чеків на комору).
 *   2. {@link mergeLowStockIntoList} — авто-вливання позицій комори, що
 *      закінчуються (`isPantryItemLowStock`, той самий поріг, що і бейдж
 *      комори), яких ще немає в списку.
 *
 * Канон nutrition §5.1: UI розрізняє джерело числа — тому кожна скоригована
 * чи довлита позиція несе `calcNote`, який пояснює, звідки взялось саме це
 * число, а не тихо підміняє AI-кількість.
 *
 * AI-CONTEXT: це VIEW-шар. Жодна з двох функцій не мутує і не персистить
 * вхідний `ShoppingList` — викликач (`apps/web`) рахує похідний
 * `CalculatedShoppingList` заново на кожен рендер із сирого списку зі
 * storage. Чекбокси й далі працюють по `item.id` над СИРИМ списком.
 */
import {
  canonicalFoodKey,
  displayFoodName,
  normalizeUnit,
} from "./pantryTextParser.js";
import { isPantryItemLowStock } from "./pantryLowStock.js";
// Таблиці одиниць живуть у `units.ts` — та сама шкала, що й у картці
// продукту комори. Дублювати їх заборонено: розʼїхавшись, вони дадуть
// різні числа на тих самих даних.
import {
  displayDecimalsFor,
  fromBaseNatural,
  fromBaseToUnit,
  toBase,
  unitDimension,
  type UnitDimension,
} from "./units.js";
import type { ShoppingItem, ShoppingList } from "./shoppingList.js";

/** Мінімальна форма позиції комори, потрібна для розрахунку (сумісна з `PantryItem`). */
export interface PantryQtyLike {
  name: unknown;
  qty: number | null | undefined;
  unit: string | null | undefined;
}

export interface ParsedQuantity {
  value: number;
  /** Нормалізована одиниця (`normalizeUnit`) — `г` | `кг` | `мл` | `л` | `шт`. */
  unit: string;
}

/** Джерело позиції в розрахованому списку. */
export type ShoppingCalcSource = "list" | "pantry-low-stock";

export interface ShoppingItemWithCalc extends ShoppingItem {
  /** Пояснення розрахунку кількості; порожній рядок = кількість не змінювалась. */
  calcNote: string;
  calcSource: ShoppingCalcSource;
}

export interface CalculatedShoppingCategory {
  name: string;
  items: ShoppingItemWithCalc[];
}

/** Позиція, повністю покрита коморою — не купувати, лише звірити. */
export interface AtHomeShoppingItem extends ShoppingItemWithCalc {
  categoryName: string;
}

export interface CalculatedShoppingList {
  /** Категорії активних (ще треба купити) позицій — та сама форма, що й `ShoppingList`. */
  categories: CalculatedShoppingCategory[];
  /** Позиції, яких у коморі вже достатньо — секція «Вже вдома», не зникають зі списку. */
  athome: AtHomeShoppingItem[];
}

/** Категорія-заглушка для довлитих low-stock позицій, коли не знайшлось спорідненої. */
export const LOW_STOCK_CATEGORY_NAME = "Закінчується вдома";

/** Точний текст `calcNote` для довлитих low-stock позицій — реюзиться UI для бейджа. */
export const LOW_STOCK_CALC_NOTE = "закінчується вдома";

/** Гасить float-похибку (0.1+0.2=0.30000000000000004) перед округленням до display-точності. */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Точність показу — `displayDecimalsFor` (units.ts), спільна з формою комори. */
function formatQty(value: number, unit: string): string {
  return `${roundTo(value, displayDecimalsFor(unit))} ${unit}`;
}

const QUANTITY_RE = /^(\d+(?:[.,]\d+)?)\s*([a-zA-Zа-яА-ЯіїєґІЇЄҐ]+)$/;

/**
 * Розпарсити рядок кількості списку покупок ("700 г", "1.2 кг", "2 шт",
 * "500 мл", "2 л") у число + нормалізовану одиницю. Нерозпізнане — будь-що
 * без явної одиниці ("3", "щіпка", "2 пучки") чи без розпізнаваного виміру
 * (маса/обʼєм/лічба) — повертає `null`: краще "не знаю", ніж вигадане число.
 */
export function parseQuantity(quantity: unknown): ParsedQuantity | null {
  const trimmed = String(quantity ?? "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(QUANTITY_RE);
  if (!m) return null;
  const rawValue = m[1];
  const rawUnit = m[2];
  if (!rawValue || !rawUnit) return null;
  const value = Number(rawValue.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = normalizeUnit(rawUnit);
  if (!unit || unitDimension(unit) == null) return null;
  return { value, unit };
}

interface PantryKeySummary {
  /** Display-назва першої знайденої позиції комори з цим ключем — для нотаток. */
  displayName: string;
  /** Сума в базовій одиниці, по кожному розпізнаному виміру. */
  totalsByDimension: Partial<Record<UnitDimension, number>>;
  /** Перша позиція з валідними qty+unit "як є" — для «звір сам»-нотатки. */
  representative: { value: number; unit: string } | null;
}

/** Групує позиції комори за `canonicalFoodKey`, підсумовуючи конвертовані виміри. */
function buildPantrySummaries(
  pantryItems: readonly PantryQtyLike[],
): Map<string, PantryKeySummary> {
  const map = new Map<string, PantryKeySummary>();
  for (const p of pantryItems) {
    const key = canonicalFoodKey(p.name);
    if (!key) continue;
    if (p.qty == null || !Number.isFinite(p.qty) || p.qty <= 0) continue;
    const unit = p.unit == null ? null : normalizeUnit(p.unit);
    if (!unit) continue;

    let summary = map.get(key);
    if (!summary) {
      summary = {
        displayName: displayFoodName(p.name),
        totalsByDimension: {},
        representative: null,
      };
      map.set(key, summary);
    }
    if (summary.representative == null) {
      summary.representative = { value: p.qty, unit };
    }
    const converted = toBase(p.qty, unit);
    if (converted) {
      summary.totalsByDimension[converted.dimension] =
        (summary.totalsByDimension[converted.dimension] ?? 0) + converted.base;
    }
  }
  return map;
}

function applyPantryToItem(
  item: ShoppingItem,
  summaries: Map<string, PantryKeySummary>,
): ShoppingItemWithCalc {
  const key = canonicalFoodKey(item.name);
  const summary = key ? summaries.get(key) : undefined;
  const base: ShoppingItemWithCalc = {
    ...item,
    calcNote: "",
    calcSource: "list",
  };
  if (!summary) return base;

  const needed = parseQuantity(item.quantity);
  const rep = summary.representative;

  // (в) кількість позиції непарсибельна — не знаємо, скільки треба, тож не
  // чіпаємо кількість, лише повідомляємо, що в коморі щось є.
  if (!needed) {
    return rep
      ? {
          ...base,
          calcNote: `в коморі є ${formatQty(rep.value, rep.unit)} — звір сам`,
        }
      : base;
  }

  const dimension = unitDimension(needed.unit);
  const haveBase = dimension ? summary.totalsByDimension[dimension] : undefined;

  // (в) юніти непорівнянні — комора має позицію, але в іншому вимірі
  // (напр. список хоче "г", комора має тільки "шт").
  if (haveBase == null) {
    return rep
      ? {
          ...base,
          calcNote: `в коморі є ${formatQty(rep.value, rep.unit)} — звір сам`,
        }
      : base;
  }

  const neededBase = toBase(needed.value, needed.unit)?.base ?? 0;

  // (а) повне покриття — `applyPantryToShoppingList` перекладе цю позицію у
  // `athome` окремим проходом (`isFullyCovered`); тут кількість не чіпаємо.
  if (haveBase >= neededBase) {
    return base;
  }

  // (б) часткове покриття — зменшуємо кількість на те, що вже є вдома.
  const remainingBase = neededBase - haveBase;
  const remainingValue = fromBaseToUnit(remainingBase, needed.unit);
  const haveInNeededUnit = fromBaseToUnit(haveBase, needed.unit);
  return {
    ...base,
    quantity: formatQty(remainingValue, needed.unit),
    calcNote: `${formatQty(needed.value, needed.unit)} − ${formatQty(
      haveInNeededUnit,
      needed.unit,
    )} у коморі`,
  };
}

function isFullyCovered(
  item: ShoppingItem,
  summaries: Map<string, PantryKeySummary>,
): boolean {
  const key = canonicalFoodKey(item.name);
  const summary = key ? summaries.get(key) : undefined;
  if (!summary) return false;
  const needed = parseQuantity(item.quantity);
  if (!needed) return false;
  const dimension = unitDimension(needed.unit);
  const haveBase = dimension ? summary.totalsByDimension[dimension] : undefined;
  if (haveBase == null) return false;
  const neededBase = toBase(needed.value, needed.unit)?.base ?? 0;
  return haveBase >= neededBase;
}

/**
 * Точне віднімання залишків комори від кожної позиції списку покупок.
 *
 * Матчинг — за `canonicalFoodKey` (той самий ключ, яким трек C мапить назви
 * чеків на комору), тож "молока"/"молоко"/"Молоко" зводяться до одного
 * порівняння. Дублікати позицій комори з однаковим ключем підсумовуються
 * (у спільному вимірі маси/обʼєму) — дві пляшки олії по 0.5 л рахуються як
 * 1 л, а не як дві окремі перевірки.
 */
export function applyPantryToShoppingList(
  list: ShoppingList,
  pantryItems: readonly PantryQtyLike[],
): CalculatedShoppingList {
  const summaries = buildPantrySummaries(pantryItems);
  const categories: CalculatedShoppingCategory[] = [];
  const athome: AtHomeShoppingItem[] = [];

  for (const cat of list.categories) {
    const activeItems: ShoppingItemWithCalc[] = [];
    for (const item of cat.items) {
      if (isFullyCovered(item, summaries)) {
        athome.push({
          ...applyPantryToItem(item, summaries),
          categoryName: cat.name,
        });
        continue;
      }
      activeItems.push(applyPantryToItem(item, summaries));
    }
    if (activeItems.length > 0)
      categories.push({ name: cat.name, items: activeItems });
  }

  return { categories, athome };
}

function collectCanonicalKeys(calculated: CalculatedShoppingList): Set<string> {
  const keys = new Set<string>();
  for (const cat of calculated.categories) {
    for (const item of cat.items) {
      const key = canonicalFoodKey(item.name);
      if (key) keys.add(key);
    }
  }
  for (const item of calculated.athome) {
    const key = canonicalFoodKey(item.name);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Найспорідненіша категорія списку для нової low-stock позиції: інша
 * позиція списку/«Вже вдома» з тим самим food-category-словником
 * (`categorizeFood`) підказує, куди природно лягла б ця назва — незалежно
 * від того, як AI назвав категорію (лейбли AI і `foodCategories.ts`
 * історично розходяться в пунктуації/формулюванні).
 */
function findRelatedCategoryName(
  calculated: CalculatedShoppingList,
  itemName: string,
  categorize: (name: unknown) => { id: string },
): string | null {
  const targetId = categorize(itemName).id;
  for (const cat of calculated.categories) {
    for (const item of cat.items) {
      if (categorize(item.name).id === targetId) return cat.name;
    }
  }
  for (const item of calculated.athome) {
    if (categorize(item.name).id === targetId) return item.categoryName;
  }
  return null;
}

let lowStockIdSeq = 0;

function makeLowStockItemId(key: string): string {
  lowStockIdSeq += 1;
  return `si_lowstock_${key}_${lowStockIdSeq}`;
}

/**
 * Довлити позиції комори, що закінчуються (`isPantryItemLowStock` — той
 * самий поріг, що і бейдж комори), яких у розрахованому списку ще немає.
 * Дублікати комори з тим самим ключем підсумовуються перед перевіркою
 * порога (дві банки по 60 г консерви — це разом 120 г, не дві позиції по
 * 60 г кожна).
 *
 * `categorize` — інʼєкція `categorizeFood` з `foodCategories.ts` (той самий
 * пакет) для підбору "доречної" категорії; винесена параметром, щоб не
 * плодити прихований import-цикл між файлами модуля.
 */
export function mergeLowStockIntoList(
  calculated: CalculatedShoppingList,
  pantryItems: readonly PantryQtyLike[],
  categorize: (name: unknown) => { id: string },
): CalculatedShoppingList {
  const summaries = buildPantrySummaries(pantryItems);
  const existingKeys = collectCanonicalKeys(calculated);

  const candidates: Array<{ key: string; summary: PantryKeySummary }> = [];
  for (const [key, summary] of summaries) {
    if (existingKeys.has(key)) continue;
    const lowStock = Object.entries(summary.totalsByDimension).some(
      ([dimension, base]) => {
        if (base == null) return false;
        const { value, unit } = fromBaseNatural(
          base,
          dimension as UnitDimension,
        );
        return isPantryItemLowStock({ qty: value, unit });
      },
    );
    if (lowStock) candidates.push({ key, summary });
  }
  if (candidates.length === 0) return calculated;

  const categories = calculated.categories.map((c) => ({
    name: c.name,
    items: [...c.items],
  }));

  for (const { key, summary } of candidates) {
    const newItem: ShoppingItemWithCalc = {
      id: makeLowStockItemId(key),
      name: summary.displayName,
      quantity: "",
      note: "",
      checked: false,
      calcNote: LOW_STOCK_CALC_NOTE,
      calcSource: "pantry-low-stock",
    };
    const targetName =
      findRelatedCategoryName(calculated, summary.displayName, categorize) ??
      LOW_STOCK_CATEGORY_NAME;
    const targetCat = categories.find((c) => c.name === targetName);
    if (targetCat) {
      targetCat.items.push(newItem);
    } else {
      categories.push({ name: targetName, items: [newItem] });
    }
  }

  return { categories, athome: calculated.athome };
}
