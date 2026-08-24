/**
 * Last validated: 2026-08-24
 * Status: Active
 *
 * Витрати по категорії ЛІМІТУ — з канонічною агрегацією ручної таксономії.
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
 * спліту має рівно один `categoryId`, тож подвійного рахунку не буває.
 */
import {
  MANUAL_EXPENSE_TAXONOMY,
  canonicalManualCategoryId,
} from "@sergeant/finyk-domain/lib/manualTaxonomy";
import { getExpenseCategoryForTransaction } from "@sergeant/finyk-domain/lib/categories";
import {
  getTxStatAmount,
  type SpendingTxLike,
  type TxCategoriesLike,
  type TxSplitsLike,
} from "@sergeant/finyk-domain/lib/transactions";

interface SplitLike {
  categoryId?: string | undefined;
  amount?: number | undefined;
}

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

function readSplits(txSplits: TxSplitsLike, id: string): readonly SplitLike[] {
  const value = txSplits[id];
  return Array.isArray(value) ? (value as readonly SplitLike[]) : [];
}

/**
 * Сума витрат (у гривнях, округлена) по кошику категорії `categoryId`.
 * Сигнатура навмисно повторює `calcCategorySpent`, щоб заміна на місці
 * виклику була однорядковою.
 */
export function calcLimitCategorySpent(
  txs: readonly SpendingTxLike[],
  categoryId: string,
  txCategories: TxCategoriesLike = {},
  txSplits: TxSplitsLike = {},
  customCategories: readonly unknown[] = [],
): number {
  if (!categoryId) return 0;
  const bucket = categoryBucketIds(categoryId);
  let total = 0;
  for (const tx of txs) {
    if (!tx || tx.amount >= 0) continue;
    const splits = readSplits(txSplits, tx.id);
    if (splits.length > 0) {
      for (const split of splits) {
        if (split.categoryId && bucket.has(split.categoryId)) {
          total += split.amount || 0;
        }
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
    if (bucket.has(resolved.id)) total += getTxStatAmount(tx);
  }
  return Math.round(total);
}
