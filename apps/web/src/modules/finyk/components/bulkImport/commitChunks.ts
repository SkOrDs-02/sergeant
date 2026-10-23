/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Нарізка вибраних рядків bulk-review на кілька commit-ів (аудит 2026-10-01,
 * ux-07). Превʼю виписки приймає до 10 000 рядків
 * (`MAX_PREVIEW_DATA_ROWS`), а один `POST /api/finyk/import/commit` лише
 * `IMPORT_COMMIT_MAX_ROWS` = 1000 (`ImportCommitRequestSchema`, більше –
 * 400 VALIDATION). Тому клієнт шле рядки частинами, кожна – окремий батч зі
 * своїм `batchId`; «Скасувати імпорт» скасовує їх усі
 * (`useChunkedImportCommit`).
 *
 * Межу частини НЕ ставимо посеред групи рядків з однаковими (дата, сума,
 * напрям). Дві речі на сервері рахуються в межах тіла ОДНОГО запиту:
 * - номер повтору для рядка без `occurrenceIndex` (рядок, відредагований у
 *   ревʼю): сервер дає найменший вільний номер у своїй групі тіла запиту
 *   (`rowKey.ts#resolveOccurrenceIndices`). Дві відредаговані однакові
 *   покупки в різних запитах обидві отримали б 0, і друга стала б
 *   «пропущено, вже імпортовано» (той самий баг, що data-29);
 * - тір-1 mono-дедуп «споживає» mono-операцію максимум одним рядком батчу
 *   (data-30); два однакові рядки в різних батчах могли б зʼїсти ту саму
 *   операцію.
 * Групуємо за (дата, сума, напрям) без опису: це грубіше за ключ сервера
 * (той ще й з описом), тож будь-яка його група гарантовано в одному запиті.
 * Межу ±1 день mono-дедупу групування не покриває, це відомий залишок.
 */
import { formatNumberUk, IMPORT_COMMIT_MAX_ROWS } from "@sergeant/shared";
import type { BulkReviewRow } from "./bulkImportRows";

function sameDayAmountKey(row: BulkReviewRow): string {
  return `${row.date}|${row.amountKopiykas}|${row.direction}`;
}

/**
 * Вибрані рядки → частини по ≤ `maxRows`. Порядок рядків усередині частини
 * той самий, що в таблиці. Група, більша за `maxRows` (тисяча однакових
 * покупок за день), ріжеться як є: інакше її не відправити взагалі.
 */
export function planCommitChunks(
  rows: readonly BulkReviewRow[],
  maxRows: number = IMPORT_COMMIT_MAX_ROWS,
): BulkReviewRow[][] {
  const groups = new Map<string, BulkReviewRow[]>();
  for (const row of rows) {
    if (!row.selected) continue;
    const key = sameDayAmountKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const chunks: BulkReviewRow[][] = [];
  let current: BulkReviewRow[] = [];
  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = [];
  };
  for (const group of groups.values()) {
    if (current.length + group.length > maxRows) flush();
    for (let i = 0; i < group.length; i += maxRows) {
      const piece = group.slice(i, i + maxRows);
      if (current.length + piece.length > maxRows) flush();
      current.push(...piece);
    }
  }
  flush();

  const order = new Map(rows.map((r, i) => [r.id, i]));
  return chunks.map((chunk) =>
    chunk.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
  );
}

/** Підказка під кнопкою «Імпортувати», коли вибрано більше за один запит. */
export function chunkedCommitHint(selectedCount: number): string | null {
  if (selectedCount <= IMPORT_COMMIT_MAX_ROWS) return null;
  return `Імпорт піде частинами по ${formatNumberUk(IMPORT_COMMIT_MAX_ROWS)} рядків.`;
}

/** Прогрес під час нарізаного commit-у; одна частина свого тексту не має. */
export function chunkProgressLabel(current: number, total: number): string {
  return `Імпортую частину ${current} з ${total}…`;
}

/**
 * Частина пішла, наступна впала. Рядки, що вже імпортовано, зникають із
 * таблиці, тож повторне «Імпортувати» досилає лише решту.
 */
export function partialCommitMessage(
  committedRows: number,
  totalRows: number,
  reason: string,
): string {
  const trimmed = reason.trim();
  const sentence = /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  return `Імпортовано рядків: ${formatNumberUk(committedRows)} з ${formatNumberUk(totalRows)}. Решта не пішла: ${sentence} Натисни «Імпортувати» ще раз, щоб дослати решту.`;
}
