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
  selected: boolean;
}

/**
 * Надходження зняті з вибору за замовчуванням (спека § Рішення дизайну
 * Фази 2, реком. founder-а — ВІДКРИТЕ питання №2, чекає ратифікації).
 */
function defaultSelected(direction: ImportDirection): boolean {
  return direction === "expense";
}

export function screenshotRowsToBulkReviewRows(
  rows: readonly ImportScreenshotRow[],
  defaultCategoryFor: (direction: ImportDirection) => string,
): BulkReviewRow[] {
  return rows.map((row, i) => ({
    id: `screenshot-${i}`,
    date: row.date,
    description: row.description,
    amountKopiykas: row.amountKopiykas,
    direction: row.direction,
    category: defaultCategoryFor(row.direction),
    confidence: row.confidence,
    selected: defaultSelected(row.direction),
  }));
}

export function statementRowsToBulkReviewRows(
  rows: readonly ImportStatementRow[],
  defaultCategoryFor: (direction: ImportDirection) => string,
): BulkReviewRow[] {
  return rows.map((row, i) => ({
    id: `statement-${i}`,
    date: row.date,
    description: row.description,
    amountKopiykas: row.amountKopiykas,
    direction: row.direction,
    category: defaultCategoryFor(row.direction),
    confidence: null,
    selected: defaultSelected(row.direction),
  }));
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

/** Масове призначення категорії — лише вибраним рядкам за замовчуванням
 * (`onlySelected = true`), щоб зміна категорії не зачепила рядки, які
 * користувач свідомо зняв з вибору. */
export function applyBulkCategory(
  rows: readonly BulkReviewRow[],
  category: string,
  onlySelected = true,
): BulkReviewRow[] {
  return rows.map((r) =>
    !onlySelected || r.selected ? { ...r, category } : r,
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
