/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Спільна форма рядка bulk-review таблиці (скрін банкінгу + CSV-виписка,
 * спека § Bulk-review UI) + чисті редактори (вибір / масова категорія /
 * inline-edit). Без React — testable окремо від таблиці.
 *
 * Дедуп-статус ДО коміту (звужене відхилення від спеки, історію див.
 * git): mono-matcher і between-imports row-key досі рахуються лише
 * всередині `commitImport`, але «сітка 2» (бета-фідбек №4, 2026-08-18)
 * додала pre-commit мітку `duplicateLikely` — сервер на превʼю звіряє
 * рядок з уже збереженими витратами за трійкою дата+сума+напрям
 * (`duplicateDetect.ts`, опис свідомо ігнорується — vision читає його
 * недетерміновано). Мітка поводиться як `transferLikely`: бейдж + знята
 * галочка, рішення за людиною.
 */
import type {
  ImportCommitRow,
  ImportDirection,
  ImportScreenshotRow,
  ImportStatementRow,
} from "@sergeant/api-client";

export interface BulkReviewRow {
  /** Client-side stable id (rows never reorder within one review session). */
  id: string;
  date: string;
  description: string;
  amountKopiykas: number;
  direction: ImportDirection;
  category: string;
  /** `null` for CSV rows (no vision signal); `0..1` for screenshot rows. */
  confidence: number | null;
  /** Сервер розмітив рядок як схожий на переказ між власними рахунками
   * («Поповнення «банка»», «Часткове зняття банки» — transferDetect.ts):
   * знятий з вибору за замовчуванням, але видимий і вмикабельний. */
  transferLikely: boolean;
  /** Сервер знайшов серед уже збережених витрат запис із тією ж
   * трійкою дата+сума+напрям (duplicateDetect.ts, «сітка 2»): найпевніше
   * цей документ (чи період) уже імпортували — знятий з вибору за
   * замовчуванням, але видимий і вмикабельний. */
  duplicateLikely: boolean;
  selected: boolean;
}

/**
 * Надходження зняті з вибору за замовчуванням (ратифіковано founder-ом
 * 2026-08-18, питання №2 спеки). Те саме — рядки з `transferLikely`
 * (follow-up тієї ж ратифікації): переказ на власну банку — не витрата,
 * галочку користувач ставить свідомо. І `duplicateLikely` («сітка 2»,
 * бета-фідбек №4): схожий запис уже збережено — повторний імпорт має
 * бути свідомим кліком, не дефолтом.
 */
function defaultSelected(
  direction: ImportDirection,
  transferLikely: boolean,
  duplicateLikely: boolean,
): boolean {
  return direction === "expense" && !transferLikely && !duplicateLikely;
}

/**
 * Категорія рядка: підказка сервера, якщо він її дав, інакше — дефолт.
 *
 * `categoryHint` сервер ставить лише за реальним доказом — власна
 * колонка категорії банку, MCC або ключові слова опису
 * (`import/categoryHint.ts`); відсутнє поле означає «доказів немає», а
 * не «Інше». Валідність слага перевіряє САМ клієнт: пікер знає, які
 * чипи існують, а сервер про власні категорії користувача не знає
 * взагалі — невідомий слаг намалював би порожній чип, тож у такому разі
 * тихо падаємо на дефолт.
 */
function categoryFor(
  hint: string | undefined,
  direction: ImportDirection,
  defaultCategoryFor: (direction: ImportDirection) => string,
  isKnownCategory: (slug: string, direction: ImportDirection) => boolean,
): string {
  if (hint && isKnownCategory(hint, direction)) return hint;
  return defaultCategoryFor(direction);
}

export interface BulkReviewRowOptions {
  defaultCategoryFor: (direction: ImportDirection) => string;
  /** Чи знає пікер такий слаг для цього напряму. */
  isKnownCategory: (slug: string, direction: ImportDirection) => boolean;
}

export function screenshotRowsToBulkReviewRows(
  rows: readonly ImportScreenshotRow[],
  options: BulkReviewRowOptions,
): BulkReviewRow[] {
  return rows.map((row, i) => {
    const transferLikely = row.transferLikely === true;
    const duplicateLikely = row.duplicateLikely === true;
    return {
      id: `screenshot-${i}`,
      date: row.date,
      description: row.description,
      amountKopiykas: row.amountKopiykas,
      direction: row.direction,
      category: categoryFor(
        row.categoryHint,
        row.direction,
        options.defaultCategoryFor,
        options.isKnownCategory,
      ),
      confidence: row.confidence,
      transferLikely,
      duplicateLikely,
      selected: defaultSelected(row.direction, transferLikely, duplicateLikely),
    };
  });
}

export function statementRowsToBulkReviewRows(
  rows: readonly ImportStatementRow[],
  options: BulkReviewRowOptions,
): BulkReviewRow[] {
  return rows.map((row, i) => {
    const transferLikely = row.transferLikely === true;
    const duplicateLikely = row.duplicateLikely === true;
    return {
      id: `statement-${i}`,
      date: row.date,
      description: row.description,
      amountKopiykas: row.amountKopiykas,
      direction: row.direction,
      category: categoryFor(
        row.categoryHint,
        row.direction,
        options.defaultCategoryFor,
        options.isKnownCategory,
      ),
      confidence: null,
      transferLikely,
      duplicateLikely,
      selected: defaultSelected(row.direction, transferLikely, duplicateLikely),
    };
  });
}

export function toggleRowSelected(
  rows: readonly BulkReviewRow[],
  id: string,
): BulkReviewRow[] {
  return rows.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r));
}

export function setAllSelected(
  rows: readonly BulkReviewRow[],
  selected: boolean,
): BulkReviewRow[] {
  return rows.map((r) => ({ ...r, selected }));
}

/**
 * Масове призначення категорії — лише вибраним рядкам за замовчуванням
 * (`onlySelected = true`), щоб зміна категорії не зачепила рядки, які
 * користувач свідомо зняв з вибору.
 *
 * ЗАВЖДИ пропускає `direction === "income"` рядки, незалежно від
 * `onlySelected` (CodeRabbit round 5, PR #818): масовий пікер у
 * `BulkReviewTable` листить лише витратні слаги (`CATEGORY_SLUGS` +
 * власні категорії — надходження мають окрему фіксовану таксономію,
 * `INCOME_CATEGORY_SLUGS`). Без цього guard-а надходження, що потрапило у
 * вибір поруч із витратами, отримало б витратний слаг, якого немає в його
 * власному per-row `<Select>` (`INCOME_CATEGORY_SLUGS`) — і
 * `toCommitRows` відправило б цей слаг з `direction: "income"` на сервер.
 */
export function applyBulkCategory(
  rows: readonly BulkReviewRow[],
  category: string,
  onlySelected = true,
): BulkReviewRow[] {
  return rows.map((r) =>
    r.direction !== "income" && (!onlySelected || r.selected)
      ? { ...r, category }
      : r,
  );
}

export function updateRowField(
  rows: readonly BulkReviewRow[],
  id: string,
  patch: Partial<
    Pick<BulkReviewRow, "description" | "amountKopiykas" | "category">
  >,
): BulkReviewRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function selectedRowCount(rows: readonly BulkReviewRow[]): number {
  return rows.reduce((n, r) => n + (r.selected ? 1 : 0), 0);
}

/** Вибрані рядки → `ImportCommitRow[]` (спека § API-контракт Фази 2). */
export function toCommitRows(
  rows: readonly BulkReviewRow[],
): ImportCommitRow[] {
  return rows
    .filter((r) => r.selected)
    .map((r) => ({
      date: r.date,
      amountKopiykas: r.amountKopiykas,
      direction: r.direction,
      description: r.description,
      category: r.category,
    }));
}
