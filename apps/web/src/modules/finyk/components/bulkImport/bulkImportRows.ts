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
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
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
  /** Рядок з не-mono джерела (Privat24, довільний файл, скрін) збігається
   * сумою й датою з гривневою операцією підключеного mono
   * (monoMatchDetect.ts, data-30). Тір-1 автоскіпу на commit-і для такого
   * джерела немає, тому це лише мітка: знятий з вибору за замовчуванням, але
   * видимий і вмикабельний. Відсутнє = збігу немає (або старий сервер). */
  monoMatchLikely?: boolean;
  /** Порядковий номер рядка серед УСІХ однакових рядків файлу/скріна
   * (дата, сума, напрям, опис), який видав сервер на превʼю. Іде в commit
   * без змін, щоб id рядка не залежав від того, які рядки групи вибрано
   * (data-29: єдина вибрана друга кава отримувала індекс 0 і збігалась з
   * уже імпортованою першою). Немає — старий сервер або рядок відредаговано
   * (`updateRowField`): сервер тоді рахує індекс по тілу запиту. */
  occurrenceIndex?: number;
  selected: boolean;
}

/**
 * Надходження зняті з вибору за замовчуванням (ратифіковано founder-ом
 * 2026-08-18, питання №2 спеки). Те саме — рядки з `transferLikely`
 * (follow-up тієї ж ратифікації): переказ на власну банку — не витрата,
 * галочку користувач ставить свідомо. І `duplicateLikely` («сітка 2»,
 * бета-фідбек №4): схожий запис уже збережено — повторний імпорт має
 * бути свідомим кліком, не дефолтом. `monoMatchLikely` (data-30) — те саме
 * для збігу з mono-операцією у виписці/скріні не-mono джерела: сервер там не
 * скіпає рядок сам, тож рішення лишається за людиною.
 */
function defaultSelected(
  direction: ImportDirection,
  transferLikely: boolean,
  duplicateLikely: boolean,
  monoMatchLikely: boolean,
): boolean {
  return (
    direction === "expense" &&
    !transferLikely &&
    !duplicateLikely &&
    !monoMatchLikely
  );
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

/** Спред для мітки: під `exactOptionalPropertyTypes` без `undefined`, тож
 * відсутня мітка означає відсутній ключ. */
function monoMatchLikelyField(
  monoMatchLikely: boolean,
): { monoMatchLikely: true } | Record<string, never> {
  return monoMatchLikely ? { monoMatchLikely: true } : {};
}

/** Спред для опційного поля: під `exactOptionalPropertyTypes` не можна
 * присвоїти `undefined`, тож відсутній індекс означає відсутній ключ. */
function occurrenceIndexField(
  occurrenceIndex: number | undefined,
): { occurrenceIndex: number } | Record<string, never> {
  return occurrenceIndex === undefined ? {} : { occurrenceIndex };
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
    const monoMatchLikely = row.monoMatchLikely === true;
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
      ...monoMatchLikelyField(monoMatchLikely),
      ...occurrenceIndexField(row.occurrenceIndex),
      selected: defaultSelected(
        row.direction,
        transferLikely,
        duplicateLikely,
        monoMatchLikely,
      ),
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
    const monoMatchLikely = row.monoMatchLikely === true;
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
      ...monoMatchLikelyField(monoMatchLikely),
      ...occurrenceIndexField(row.occurrenceIndex),
      selected: defaultSelected(
        row.direction,
        transferLikely,
        duplicateLikely,
        monoMatchLikely,
      ),
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
  return rows.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    // Індекс із превʼю описує групу ОРИГІНАЛЬНОГО (дата, сума, опис). Після
    // правки опису чи суми рядок може опинитись в іншій групі, де цей індекс
    // уже зайнятий іншим рядком; тому індекс скидаємо, і сервер призначить
    // вільний (`rowKey.ts#resolveOccurrenceIndices`).
    const regrouped =
      next.description !== r.description ||
      next.amountKopiykas !== r.amountKopiykas;
    if (regrouped && next.occurrenceIndex !== undefined) {
      const { occurrenceIndex: _dropped, ...rest } = next;
      return rest;
    }
    return next;
  });
}

/**
 * Перемикач напряму рядка (аудит 2026-10-01, logic-06). Виписка без окремих
 * колонок дебету й кредиту або хибно розпізнаний знак дає рядки не того
 * напряму, і до цього кроку виправити їх у перевірці було нічим.
 *
 * Що скидається разом із напрямом:
 * - категорія: витрати й надходження мають різні каталоги, тож витратний
 *   слаг у рядку надходження дав би порожній чип. Лишається лише
 *   «Внутрішній переказ», бо він є в обох пікерах;
 * - `occurrenceIndex`: група однакових рядків рахується за (дата, сума,
 *   напрям, опис), і після зміни напряму рядок у чужій групі (як після
 *   правки суми в `updateRowField`);
 * - `duplicateLikely` і `monoMatchLikely`: сервер звіряв рядок з УЖЕ
 *   збереженими записами з урахуванням напряму (знаку), тож для нового
 *   напряму ці мітки нічого не кажуть. `transferLikely` лишається: сервер
 *   ставить його за описом.
 *
 * Вибір рядка не змінюється: галочку людина ставить сама.
 */
export function setRowDirection(
  rows: readonly BulkReviewRow[],
  id: string,
  direction: ImportDirection,
  defaultCategoryFor: (direction: ImportDirection) => string,
): BulkReviewRow[] {
  return rows.map((r) => {
    if (r.id !== id || r.direction === direction) return r;
    const {
      occurrenceIndex: _droppedIndex,
      monoMatchLikely: _droppedMonoMatch,
      ...rest
    } = r;
    return {
      ...rest,
      direction,
      category:
        r.category === INTERNAL_TRANSFER_ID
          ? r.category
          : defaultCategoryFor(direction),
      duplicateLikely: false,
    };
  });
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
      ...occurrenceIndexField(r.occurrenceIndex),
    }));
}
