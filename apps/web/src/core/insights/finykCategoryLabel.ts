/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Підпис категорії витрати для AI-зведень (тижневий дайджест і коуч).
 *
 * Одне місце на обох споживачів: до 2026-10-01 дайджест мав власний резолвер
 * у `aggregateFinyk`, а коуч - свій, на сирому `txCategories[id] || mcc`.
 * Коуч не бачив ані ручних витрат (`mcc: 0`, категорія в `categoryId`), ані
 * ключових слів опису, ані користувацьких категорій, тож «Інше» в його
 * знімку роздувалось, а власна категорія їхала в промпт сирим слагом.
 */
import {
  getCategory,
  resolveExpenseCategoryMeta,
} from "@sergeant/finyk-domain/lib/categories";
import { canonicalManualCategoryId } from "@sergeant/finyk-domain/lib/manualTaxonomy";

/** Мінімум полів транзакції, потрібних резолверу (підмножина `BankTxLike`). */
export interface FinykCategoryLabelTx {
  id: string;
  description?: string | undefined;
  mcc?: number | undefined;
  manual?: boolean | undefined;
  categoryId?: string | undefined;
}

/**
 * Підпис КАНОНІЧНОЇ категорії витрати: оверрайд користувача → категорія
 * ручного запису → MCC / ключові слова опису → «Інше».
 */
export function finykExpenseCategoryLabel(
  tx: FinykCategoryLabelTx,
  txCategories: Record<string, string>,
  customCategories: readonly unknown[],
): string {
  // W1-CANON-AGG стадія 2d: ручний запис не має ані рядка в
  // `finyk_tx_cats` (там ключі банківських id), ані MCC — його
  // категорія приїжджає полем `categoryId` з
  // `manualExpenseToTransaction`. Без цієї гілки вся готівка осідала б
  // у «Інше», і топ-категорії брехали б рівно на суму ручного світу.
  // Гілка навмисно звужена до `manual`: банківські рядки теж несуть
  // `categoryId`, і зчитувати його тут означало б тихо перекроїти вже
  // показану користувачу розбивку банківських витрат.
  const manualCategory = tx.manual && tx.categoryId ? tx.categoryId : null;
  const override = txCategories[tx.id] ?? manualCategory ?? null;
  // AI-CONTEXT (bug 2026-08-09): резолвимо КАНОНІЧНОЮ `getCategory` —
  // тією самою, що друкує підпис у стрічці транзакцій і в Звітах.
  // Власний резолвер дайджесту не знав ані keyword-матчингу, ані
  // фолбеку «Інше»: невідомий MCC витікав користувачеві сирим рядком
  // `MCC 4829` (це «переказ коштів»), і той самий рядок ішов у промпт
  // моделі, яка потім пояснювала людині її ж «категорію MCC 4829».
  const resolved = getCategory(
    tx.description ?? "",
    tx.mcc ?? 0,
    override,
    customCategories,
  );
  // Ключ — підпис КАНОНІЧНОЇ категорії. Детальні слаги ручної форми
  // (`cafe`, `tech`, `groceries`) не мають запису в MCC-каталозі, тож
  // без цього зведення `cafe` давав рядок «☕ Кафе та ресторани»
  // ПОРУЧ із банківським «🍔 Кафе та ресторани» - дві позиції з
  // однаковою назвою і різним емодзі, бо ключування за label-ом
  // мерджить лише те, що вже має однаковий підпис. Кастомні id
  // проходять недоторканими.
  const canonicalId = canonicalManualCategoryId(resolved.id);
  if (canonicalId === resolved.id) return resolved.label;
  return (
    resolveExpenseCategoryMeta(canonicalId, customCategories)?.label ??
    resolved.label
  );
}
