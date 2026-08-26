/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Витрати по категоріях ЛІМІТУ — з канонічною агрегацією ручної таксономії.
 * Переїхало з `apps/web/.../budgets/limitCategorySpend.ts` (2026-08-25), коли
 * ліміт став мульти-категорійним: тепер цю арифметику читають і web-сторінки
 * (Budgets, Overview, insight-хуки), і потенційно mobile — місце їй у домені.
 *
 * AI-DANGER: категорію ліміту людина обирає з MCC-каталогу
 * (`mergeExpenseCategoryDefinitions`), а категорію ручної витрати — з
 * ручної таксономії (`MANUAL_EXPENSE_TAXONOMY`). Списки НЕ збігаються:
 * ручна детальніша, і кілька її слагів зводяться до іншого канонічного id —
 * `groceries → food`, `cafe → restaurant`, `tech → shopping`. Саме для цього
 * в таксономії існує поле `canonicalId`: «канонічна категорія MCC-каталогу,
 * у яку ця ручна категорія агрегується **в бюджетах**, аналітиці й палітрі».
 *
 * Бюджети цього не робили. `calcCategorySpent` порівнює резолвнутий id із
 * id ліміту БУКВАЛЬНО, тож витрата зі слагом `cafe` не потрапляла в ліміт
 * «Кафе та ресторани» (`restaurant`), а `groceries` — у ліміт «Продукти»
 * (`food`). Той самий підпис у двох місцях, різні id всередині: людина
 * бачила витрати в Аналітиці й нуль у щойно створеному ліміті, причому
 * після перезавантаження нуль лишався — бо це не гонка, а розходження
 * словників. Звіт QA 2026-08-23 («новий бюджет ігнорує наявні витрати»).
 *
 * Тут — один прохід по транзакціях із МНОЖИНОЮ прийнятних id замість
 * одного. Одна транзакція резолвиться рівно в одну категорію, а частка
 * спліту має рівно один `categoryId`, тож подвійного рахунку не буває —
 * зокрема й для мульти-категорійного ліміту: транзакція лягає в перший
 * кошик набору, який її приймає, і рівно один раз.
 */
import {
  MANUAL_EXPENSE_TAXONOMY,
  canonicalManualCategoryId,
} from "./manualTaxonomy.js";
import { getExpenseCategoryForTransaction } from "./categories.js";
import {
  getTxStatAmount,
  type SpendingTxLike,
  type TxCategoriesLike,
  type TxSplitsLike,
} from "./transactions.js";

interface SplitLike {
  categoryId?: string | undefined;
  amount?: number | undefined;
}

/** Одна категорія ліміту або повний набір мульти-категорійного ліміту. */
export type LimitCategoryInput = string | readonly string[];

/**
 * Усі id, які лягають у той самий кошик, що й `categoryId`: сам id, його
 * канонічний id і всі ручні слаги з таким же канонічним id.
 */
export function categoryBucketIds(categoryId: string): Set<string> {
  const canonical = canonicalManualCategoryId(categoryId);
  const ids = new Set<string>([categoryId, canonical]);
  for (const def of MANUAL_EXPENSE_TAXONOMY) {
    if (def.canonicalId === canonical) ids.add(def.id);
  }
  return ids;
}

function toCategoryIdList(category: LimitCategoryInput): string[] {
  const raw = typeof category === "string" ? [category] : category;
  const out: string[] = [];
  for (const id of raw) {
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

function readSplits(txSplits: TxSplitsLike, id: string): readonly SplitLike[] {
  const value = txSplits[id];
  return Array.isArray(value) ? (value as readonly SplitLike[]) : [];
}

/**
 * Розкладає транзакції по кошиках обраних категорій. Ключ результату —
 * id категорії ліміту (не канонічний id), значення — нескруглена сума.
 * Транзакція/частка спліту лягає в ПЕРШИЙ кошик набору, який її приймає,
 * тож сума по всіх ключах завжди дорівнює загальному spent комбо-ліміту.
 */
function accumulateByCategory(
  txs: readonly SpendingTxLike[],
  categoryIds: readonly string[],
  txCategories: TxCategoriesLike,
  txSplits: TxSplitsLike,
  customCategories: readonly unknown[],
): Map<string, number> {
  const totals = new Map<string, number>();
  const buckets = categoryIds.map((id) => [id, categoryBucketIds(id)] as const);
  for (const id of categoryIds) totals.set(id, 0);
  const add = (resolvedId: string, amount: number) => {
    for (const [id, bucket] of buckets) {
      if (bucket.has(resolvedId)) {
        totals.set(id, (totals.get(id) || 0) + amount);
        return;
      }
    }
  };
  for (const tx of txs) {
    if (!tx || tx.amount >= 0) continue;
    const splits = readSplits(txSplits, tx.id);
    if (splits.length > 0) {
      for (const split of splits) {
        if (split.categoryId) add(split.categoryId, split.amount || 0);
      }
      continue;
    }
    const resolved = getExpenseCategoryForTransaction(
      tx,
      txCategories[tx.id] ?? null,
      customCategories,
    );
    // Без спліту `getTxStatAmount` — канонічна сума витрати транзакції
    // (реєстр метрик); свій `Math.abs(amount / 100)` тут розійшовся б із
    // рештою екранів.
    add(resolved.id, getTxStatAmount(tx));
  }
  return totals;
}

/**
 * Сума витрат (у гривнях, округлена) по кошику однієї категорії або по
 * обʼєднанню кошиків мульти-категорійного ліміту.
 */
export function calcLimitCategorySpent(
  txs: readonly SpendingTxLike[],
  category: LimitCategoryInput,
  txCategories: TxCategoriesLike = {},
  txSplits: TxSplitsLike = {},
  customCategories: readonly unknown[] = [],
): number {
  const categoryIds = toCategoryIdList(category);
  if (categoryIds.length === 0) return 0;
  let total = 0;
  for (const value of accumulateByCategory(
    txs,
    categoryIds,
    txCategories,
    txSplits,
    customCategories,
  ).values()) {
    total += value;
  }
  return Math.round(total);
}

/**
 * Розбивка факту комбо-ліміту по його категоріях — для рядків
 * «Продукти — 6 400 ₴ · Кафе — 3 100 ₴» на картці. Порядок збігається з
 * порядком `categoryIds`; сума `spent` по рядках = `calcLimitCategorySpent`.
 */
export function calcLimitCategoryBreakdown(
  txs: readonly SpendingTxLike[],
  categoryIds: readonly string[],
  txCategories: TxCategoriesLike = {},
  txSplits: TxSplitsLike = {},
  customCategories: readonly unknown[] = [],
): { categoryId: string; spent: number }[] {
  const ids = toCategoryIdList(categoryIds);
  if (ids.length === 0) return [];
  const totals = accumulateByCategory(
    txs,
    ids,
    txCategories,
    txSplits,
    customCategories,
  );
  return ids.map((categoryId) => ({
    categoryId,
    spent: Math.round(totals.get(categoryId) || 0),
  }));
}
