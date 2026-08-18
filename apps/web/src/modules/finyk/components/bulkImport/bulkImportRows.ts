/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Спільна форма рядка bulk-review таблиці (скрін банкінгу + CSV-виписка,
 * спека § Bulk-review UI) + чисті редактори (вибір / масова категорія /
 * inline-edit). Без React — testable окремо від таблиці.
 *
 * ВІДХИЛЕННЯ ВІД СПЕКИ (задокументовано в звіті web-agent-а PR #818):
 * `BulkReviewRow` НЕ несе tier-1/2 дедуп-статусу («= mono-транзакція» /
 * «вже імпортовано») ДО коміту — жоден з дев'яти ендпоінтів контракту не
 * дає pre-commit dedup-preview (mono-matcher і between-imports row-key
 * рахуються ВИКЛЮЧНО всередині `commitImport`, як побічний ефект самого
 * запису). Статус-бейджі рядка в спеці («нова»/«лінк»/«пропущено») —
 * пост-фактум, у `ImportCommitResponse.skipped` (агреговані числа) — не
 * per-row. Bulk-review таблиця тому показує лише direction-бейдж і
 * vision-confidence (обидва є у відповіді), без dedup-статусу.
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
  selected: boolean;
}

/**
 * Надходження зняті з вибору за замовчуванням (ратифіковано founder-ом
 * 2026-08-18, питання №2 спеки). Те саме — рядки з `transferLikely`
 * (follow-up тієї ж ратифікації): переказ на власну банку — не витрата,
 * галочку користувач ставить свідомо.
 */
function defaultSelected(
  direction: ImportDirection,
  transferLikely: boolean,
): boolean {
  return direction === "expense" && !transferLikely;
}

export function screenshotRowsToBulkReviewRows(
  rows: readonly ImportScreenshotRow[],
  defaultCategoryFor: (direction: ImportDirection) => string,
): BulkReviewRow[] {
  return rows.map((row, i) => {
    const transferLikely = row.transferLikely === true;
    return {
      id: `screenshot-${i}`,
      date: row.date,
      description: row.description,
      amountKopiykas: row.amountKopiykas,
      direction: row.direction,
      category: defaultCategoryFor(row.direction),
      confidence: row.confidence,
      transferLikely,
      selected: defaultSelected(row.direction, transferLikely),
    };
  });
}

export function statementRowsToBulkReviewRows(
  rows: readonly ImportStatementRow[],
  defaultCategoryFor: (direction: ImportDirection) => string,
): BulkReviewRow[] {
  return rows.map((row, i) => {
    const transferLikely = row.transferLikely === true;
    return {
      id: `statement-${i}`,
      date: row.date,
      description: row.description,
      amountKopiykas: row.amountKopiykas,
      direction: row.direction,
      category: defaultCategoryFor(row.direction),
      confidence: null,
      transferLikely,
      selected: defaultSelected(row.direction, transferLikely),
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
