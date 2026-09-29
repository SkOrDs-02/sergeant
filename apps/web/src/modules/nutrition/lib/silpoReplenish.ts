/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * Чисті функції побудови рядків «З чека» і перетворення підтверджених
 * рядків на `PantryItem[]` - винесені з `useSilpoPantryReplenish.ts` (спека
 * `docs/work/specs/silpo-pantry-auto-import.md` § Рішення дизайну, «Логіку
 * рядків виносимо в чисті функції»), щоб ручний і автоматичний потоки писали
 * в комору однаково. `useSilpoPantryReplenish` (ручний потік, аркуш «З
 * чека») і `useSilpoPantryAutoImport` (автоімпорт) обидва викликають
 * `buildSilpoReplenishRows` + `rowsToPantryItems` замість дублювання логіки.
 */
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import {
  buildPantryIndex,
  categorizeFood,
  displayFoodName,
  findPantryMatch,
  genericFoodName,
  matchFoodName,
  receiptQtyToBase,
  receiptPackCount,
  type PantryItemSource,
} from "@sergeant/nutrition-domain";
import { pluralUa, toKyivISODate, type UaPluralForms } from "@sergeant/shared";
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
  checked: boolean;
}

export interface BuildSilpoReplenishRowsParams {
  items: readonly SilpoReceiptItemDto[];
  pantryIndex: ReturnType<typeof buildPantryIndex>;
  /** Явний вибір людини (toggle) - має пріоритет над дефолтом `groceries`. */
  checkedState: Readonly<Record<number, boolean>>;
  keepFullState: Readonly<Record<number, boolean>>;
}

/**
 * Дефолт чекбокса: `checkedState` перемикає явний вибір людини; коли його
 * ще немає - «вже в коморі» (`pantryClaimedAt != null`) залишається БЕЗ
 * галочки (спека § Рішення дизайну, «Вигляд позначки»), інакше дефолт -
 * `groceries`.
 */
function defaultChecked(item: SilpoReceiptItemDto): boolean {
  if (item.pantryClaimedAt != null) return false;
  return mapReceiptItemToCategory(item) === "groceries";
}

export function buildSilpoReplenishRows({
  items,
  pantryIndex,
  checkedState,
  keepFullState,
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
      checked: checkedState[item.id] ?? defaultChecked(item),
    };
  });
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

const PRODUCT_FORMS: UaPluralForms = {
  one: "продукт",
  few: "продукти",
  many: "продуктів",
};
const RECEIPT_FORMS: UaPluralForms = {
  one: "чека",
  few: "чеків",
  many: "чеків",
};
// `few`/`many` тут навмисно однакові («чеків»), а не «чеки»: фраза «з 2
// чеків Сільпо» (родовий відмінок після прийменника «з»), не «з 2 чеки»
// (називний, як було б у голому лічильнику «2 чеки»). `one` не
// використовується цим викликом (галузь `receiptCount > 1`), лишений
// заради повноти форми.

/**
 * Текст тосту одного проходу автоімпорту (спека § Рішення дизайну, «Тост і
 * «Повернути»»): «Додано N продуктів з чека Сільпо» для одного чека,
 * «...з K чеків Сільпо» для кількох. Функція, не запис у `messages` -
 * каталог i18n типізований як дерево рядків без функцій
 * (`MessageCatalog` constraint, `@shared/i18n/uk.ts`).
 */
export function buildSilpoAutoImportToastMessage(
  addedCount: number,
  receiptCount: number,
): string {
  const productWord = pluralUa(addedCount, PRODUCT_FORMS);
  if (receiptCount > 1) {
    const receiptWord = pluralUa(receiptCount, RECEIPT_FORMS);
    return `Додано ${addedCount} ${productWord} з ${receiptCount} ${receiptWord} Сільпо`;
  }
  return `Додано ${addedCount} ${productWord} з чека Сільпо`;
}
