/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * Чисті функції побудови рядків аркуша чека і перетворення підтверджених
 * рядків на `PantryItem[]` (спека `docs/work/specs/silpo-pantry-auto-import.md`
 * § «Логіку рядків виносимо в чисті функції»). Галочки за замовчуванням
 * враховують давність чека і вивчене «зазвичай не додаєш», а
 * `buildPantrySkipUpdate` рахує, що з цього записати в лічильники (спека
 * `docs/work/specs/silpo-pantry-confirm.md`). Обидва режими аркуша (один
 * чек у «З чека» і нові чеки з картки в огляді) будують рядки тут.
 */
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import {
  buildPantryIndex,
  canonicalFoodKey,
  categorizeFood,
  displayFoodName,
  findPantryMatch,
  genericFoodName,
  matchFoodName,
  normalizeReceiptItemName,
  receiptQtyToBase,
  receiptPackCount,
  type PantryItemSource,
} from "@sergeant/nutrition-domain";
import { toKyivISODate } from "@sergeant/shared";
import type { SilpoReceiptItemDto } from "@shared/api";
import type { PantryItem } from "./pantryTextParser";
import { receiptQtyToGrams } from "@shared/lib/format/receiptQty";

export interface SilpoReplenishRow {
  item: SilpoReceiptItemDto;
  /** finyk-категорія позиції (детермінований мапер, `@sergeant/finyk-domain`). */
  category: string;
  /**
   * Іконка ХАРЧОВОЇ категорії - не плутати з `category` вище, це різні
   * класифікації: та витратна (для Фініка), ця продуктова.
   *
   * AI-DANGER: для НЕпродуктів тут навмисно нейтральний `package`, а не
   * здогадка `categorizeFood`. Класифікатор навчений на їжі й на чужому
   * ловиться на словах: «Зубна паста Sensodyne» дає `bottle` («Соуси та
   * пасти»). Ознака продукту тут та сама, що вмикає галочку:
   * `mapReceiptItemToCategory(item)`.
   */
  foodIconName: string;
  /** Display-назва існуючої позиції комори, якщо знайдено збіг за `canonicalFoodKey`. `null` = «нова позиція». */
  matchedName: string | null;
  /**
   * Родова назва, під яку ляже позиція, коли згортання щось змінює.
   * `null` - назва не змінюється (згортання вимкнене для категорії або
   * викидати не було чого), тож рядок показується як раніше.
   */
  genericName: string | null;
  /** Людина натиснула «лишити повну» - згортання для цього рядка вимкнене. */
  keepFull: boolean;
  /**
   * Позицію вже взяли з чека, і продукт досі лежить у коморі. Галочку тут
   * поставити не можна: повторна та сама покупка злиттям відкидається як
   * дубль, тож «додати ще раз» мовчки нічого б не додало. Коли продукт з
   * комори видалили, рядок знову доступний.
   */
  locked: boolean;
  checked: boolean;
  /** Галочка, яку рядок мав би без втручання людини. */
  defaultChecked: boolean;
  /** Ключ продукту для лічильника «зазвичай не додаєш» ({@link pantryProductKey}). */
  productKey: string;
  /** Людина тричі поспіль знімала з цього продукту галочку: рядок без неї. */
  usuallySkipped: boolean;
}

export interface BuildSilpoReplenishRowsParams {
  items: readonly SilpoReceiptItemDto[];
  pantryIndex: ReturnType<typeof buildPantryIndex>;
  /** Явний вибір людини (toggle) - має пріоритет над дефолтом `groceries`. */
  checkedState: Readonly<Record<number, boolean>>;
  keepFullState: Readonly<Record<number, boolean>>;
  /** Чек старший за {@link STALE_RECEIPT_DAYS} днів: усі рядки без галочки. */
  stale?: boolean;
  /** Ключі продуктів, які людина зазвичай не додає (`GET /api/silpo/pantry-skips`). */
  skippedKeys?: ReadonlySet<string>;
}

/** Поріг давності чека, після якого аркуш не ставить жодної галочки. */
export const STALE_RECEIPT_DAYS = 7;
const DAY_MS = 86_400_000;

export function isStaleReceipt(purchasedAt: string, nowMs: number): boolean {
  return nowMs - Date.parse(purchasedAt) > STALE_RECEIPT_DAYS * DAY_MS;
}

/** Повні дні від покупки до `nowMs`: «куплено 9 днів тому». */
export function receiptAgeDays(purchasedAt: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(purchasedAt)) / DAY_MS);
}

/**
 * Ключ продукту для лічильника «зазвичай не додаєш» - та сама родова назва,
 * під якою рядок ляже в комору (`categorizeFood(...).collapseBrand` +
 * `genericFoodName`), у формі ключа злиття комори. «Молоко Галичина 2,5%» і
 * «Молоко Яготинське» дають один ключ, «Сир кисломолочний» і «Сир твердий
 * Гауда» різні. Напої й снеки бренд не згортають, тож там ключ - назва без
 * пакувального шуму.
 */
export function pantryProductKey(itemName: string): string {
  const name = categorizeFood(itemName).collapseBrand
    ? genericFoodName(itemName)
    : normalizeReceiptItemName(itemName);
  return canonicalFoodKey(name);
}

export function buildSilpoReplenishRows({
  items,
  pantryIndex,
  checkedState,
  keepFullState,
  stale = false,
  skippedKeys,
}: BuildSilpoReplenishRowsParams): SilpoReplenishRow[] {
  return items.map((item) => {
    // `findPantryMatch` бере на себе і точний збіг ключів, і випадок
    // «коротка назва комори всередині довгої назви з чека».
    const match = findPantryMatch(item.name, pantryIndex);
    // Згортати чи ні - вирішує КАТЕГОРІЯ продукту: у напоях і снеках бренд
    // змінює суть («Red Bull» це не «Burn»), тож там назва їде як є.
    const category = categorizeFood(item.name);
    const generic = category.collapseBrand ? genericFoodName(item.name) : "";
    const finykCategory = mapReceiptItemToCategory(item);
    const isGrocery = finykCategory === "groceries";
    const locked = item.pantryClaimedAt != null && match != null;
    const productKey = pantryProductKey(item.name);
    const usuallySkipped =
      isGrocery &&
      item.pantryClaimedAt == null &&
      (skippedKeys?.has(productKey) ?? false);
    // Без явного вибору людини: «вже в коморі», хімія, старий чек і вивчене
    // «зазвичай не додаєш» без галочки, решта продуктів з галочкою.
    const defaultChecked =
      isGrocery && item.pantryClaimedAt == null && !stale && !usuallySkipped;
    return {
      item,
      category: finykCategory,
      foodIconName: isGrocery ? category.iconName : "package",
      matchedName: match ? displayFoodName(match.name) : null,
      genericName:
        generic && matchFoodName(generic) !== matchFoodName(item.name)
          ? generic
          : null,
      keepFull: keepFullState[item.id] ?? false,
      locked,
      checked: !locked && (checkedState[item.id] ?? defaultChecked),
      defaultChecked,
      productKey,
      usuallySkipped,
    };
  });
}

/**
 * Що записати в лічильники «зазвичай не додаєш» після «Додати». `skipped` -
 * рядки, де галочка стояла за замовчуванням і людина її зняла; `added` -
 * рядки, які реально лягли в комору (`claimedItemIds`). Рядки без галочки за
 * замовчуванням (хімія, старий чек, вже вивчене), які людина не чіпала, не
 * рахуються. Продукт, що є в обох списках, лишається лише в `added`.
 */
export function buildPantrySkipUpdate(
  rows: readonly SilpoReplenishRow[],
  claimedItemIds: ReadonlySet<number>,
): { skipped: string[]; added: string[] } {
  const added = new Set<string>();
  const skipped = new Set<string>();
  for (const r of rows) {
    if (r.checked && claimedItemIds.has(r.item.id)) added.add(r.productKey);
    else if (!r.locked && r.defaultChecked && !r.checked) {
      skipped.add(r.productKey);
    }
  }
  return {
    skipped: [...skipped].filter((k) => !added.has(k)),
    added: [...added],
  };
}

/**
 * Перетворює ПІДТВЕРДЖЕНІ рядки (вже відфільтровані викликачем - `checked`
 * у ручному потоці, «всі groceries» в автоімпорті) на `PantryItem[]` для
 * `upsertItem`/`upsertItemForAutoImport`.
 *
 * Кожен рядок їде під СВОЄЮ родовою назвою, а повна назва з чека зберігається
 * варіантом (джерелом). `purchasedAt` - день ПОКУПКИ (Київ), не день
 * імпорту: чек - фінансовий запис, і саме на цю стабільність спирається
 * дедуп повторного імпорту.
 */
export function rowsToPantryItems(
  rows: readonly SilpoReplenishRow[],
  purchasedAt: string | Date,
): PantryItem[] {
  const addedAt = toKyivISODate(purchasedAt);
  return rows.map((r) => {
    const name = r.keepFull ? r.item.name : (r.genericName ?? r.item.name);
    // Назва потрібна для щільності: «Молоко ... 900г» з чека має лягти як
    // 874 мл, інакше воно ніколи не зійдеться з «Молоко 1 л» в одну картку.
    const based = receiptQtyToBase(r.item.qty, r.item.unit, name);
    if (!based) {
      // Одиниця без масштабу («уп») - варіант створити чесно не можна.
      return { name, qty: r.item.qty, unit: r.item.unit, notes: null };
    }
    const source: PantryItemSource = {
      name: displayFoodName(r.item.name),
      qty: based.qty,
      unit: based.unit,
      addedAt,
      packCount: receiptPackCount(r.item.qty, r.item.unit),
      packGrams: receiptQtyToGrams(r.item.qty, r.item.unit),
    };
    return {
      name,
      qty: based.qty,
      unit: based.unit,
      notes: null,
      sources: [source],
    };
  });
}
