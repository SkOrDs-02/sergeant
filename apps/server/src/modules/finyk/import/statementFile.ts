import { ValidationError } from "../../../obs/errors.js";
import { isBlankRow, tokenizeCsv, type CsvDelimiter } from "./csvParser.js";
import { htmlTableToGrid, looksLikeHtmlTable } from "./htmlTableGrid.js";
import { looksLikeZip } from "./zipReader.js";
import { XlsxFormatError, xlsxToGrid } from "./xlsxGrid.js";

/**
 * Один вхід для БУДЬ-ЯКОГО файлу виписки: байти → сітка `string[][]` +
 * індекс рядка-заголовка. Далі — спільний шлях автопрофілів і
 * column-mapper-а (`statementPreview.ts`), незалежно від того, звідки
 * прийшла сітка.
 *
 * WHY цей модуль існує: до нього `statement/preview` приймав ЛИШЕ
 * `csv_text` (спека § Фаза 2б відкладала XLS/XLSX). Privat24 віддає
 * виписку саме таблицею, тож найпоширеніший після mono банк не
 * імпортувався взагалі — не «погано парсився», а падав ще на пікері
 * файлів (`accept=".csv"`).
 *
 * Три речі, які тут вирішуються і яких CSV-шлях не мав:
 *   1. **Формат** — XLSX (ZIP+OOXML), HTML-таблиця під виглядом `.xls`,
 *      звичайний текст. Старий бінарний `.xls` (BIFF/OLE2) і PDF —
 *      чесна відмова з інструкцією, а не мовчазний нуль рядків.
 *   2. **Кодування** — банківські CSV регулярно у windows-1251. Раніше
 *      файл читався в браузері як UTF-8 (`file.text()`), і кирилиця
 *      перетворювалась на сміття ЩЕ ДО сервера, тому жоден заголовок не
 *      матчився і людина завжди опинялась у ручному mapper-і з
 *      нечитабельними назвами колонок.
 *   3. **Преамбула** — таблична виписка майже завжди починається з
 *      кількох рядків шапки («Виписка за період…», ПІБ, номер рахунку).
 *      Заголовок колонок — НЕ перший рядок, і без його пошуку автопрофіль
 *      не спрацьовував би ніколи.
 */

/**
 * `"sheet"` — сітка прийшла з типізованих клітинок XLSX, тобто дати й суми
 * вже КАНОНІЧНІ (`2026-08-16`, `-1234.56`). Для такої сітки
 * `statementPreview` знімає з профілю жорсткі підказки
 * `dateFormat`/`decimalComma` — вони описують ДРУКОВАНИЙ формат банку і на
 * канонічних значеннях дали б протилежний результат (див. `xlsxGrid.ts`).
 * `"csv"` — значення такі, як їх надрукував банк (CSV, HTML-таблиця).
 */
export type StatementSourceKind = "csv" | "sheet";

export interface StatementGrid {
  rows: string[][];
  sourceKind: StatementSourceKind;
  /** 0-based індекс рядка з назвами колонок усередині `rows`. */
  headerRowIndex: number;
}

/** Той самий кап, що на `csv_text` (`IMPORT_STATEMENT_MAX_CSV_BYTES`), але
 * на РОЗПАКОВАНІ байти файлу. */
export const STATEMENT_MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Скільки перших рядків сітки сканується в пошуках заголовка. Преамбула
 * реальних виписок — одиниці рядків; 30 це межа з запасом, за якою
 * «заголовок» уже радше не заголовок. */
const HEADER_SCAN_ROWS = 30;

// ─────────────────────────── Encoding ────────────────────────────────────

/**
 * Декодує байти в текст: спершу строгий UTF-8, і лише якщо він невалідний
 * — windows-1251 (домінантне однобайтове кодування українських
 * банк-експортів; Node 22 йде з повним ICU, тож декодер доступний завжди).
 */
export function decodeStatementText(bytes: Buffer): string {
  const withoutBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(withoutBom);
  } catch {
    try {
      return new TextDecoder("windows-1251").decode(withoutBom);
    } catch {
      return withoutBom.toString("latin1");
    }
  }
}

// ─────────────────────────── Delimiter ───────────────────────────────────

const CANDIDATES: readonly CsvDelimiter[] = [",", ";", "\t"];
/** Детект розділювача працює на першому шматку файлу — повний 5MB прогін
 * трьома кандидатами не дав би нової інформації, лише роботу. */
const DELIMITER_SAMPLE_BYTES = 64 * 1024;

/**
 * Обирає розділювач за СТРУКТУРОЮ, а не за одним заголовковим рядком:
 * токенізує пробу кожним кандидатом і бере той, що дає найбільше рядків
 * з однаковою (модальною) кількістю колонок ≥2.
 *
 * WHY не `detectDelimiter(headerLine)`: у виписки з преамбулою перший
 * рядок — це «Виписка за період 01.08.2026 — 25.08.2026» без жодного
 * розділювача, і посимвольний підрахунок по ньому обирав кому наосліп.
 */
export function detectDelimiterByStructure(text: string): CsvDelimiter {
  const sample = text.slice(0, DELIMITER_SAMPLE_BYTES);
  let best: CsvDelimiter = ",";
  let bestScore = 0;

  for (const delimiter of CANDIDATES) {
    const rows = tokenizeCsv(sample, delimiter).filter((r) => !isBlankRow(r));
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let modalWidth = 0;
    let modalRows = 0;
    for (const [width, n] of counts) {
      if (width >= 2 && n > modalRows) {
        modalRows = n;
        modalWidth = width;
      }
    }
    const score = modalRows * modalWidth;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

// ────────────────────────── Header row lookup ────────────────────────────

/** Фрагменти, які зустрічаються в шапці банківської виписки (укр/рос/англ).
 * Це евристика ранжування, НЕ вимога: рядок без жодного збігу все одно
 * може стати заголовком, якщо кращого немає. */
const HEADER_HINTS = [
  "дата",
  "сума",
  "опис",
  "деталі",
  "призначення",
  "валют",
  "картк",
  "рахун",
  "баланс",
  "залишок",
  "час",
  "категор",
  "коментар",
  "mcc",
  "date",
  "amount",
  "description",
  "currency",
  "balance",
  "operation",
  "debit",
  "credit",
];

/**
 * Рахунок «схожості на заголовок». `0`, якщо в рядку НЕМА жодного
 * знайомого слова — саме це і робить евристику безпечною: рядок даних не
 * може перебити перший непорожній рядок просто тому, що він багатослівний
 * (без цієї умови виписка БЕЗ заголовка тихо втрачала б перші рядки).
 */
function headerScore(row: string[]): number {
  const filled = row.filter((c) => c.trim() !== "").length;
  if (filled < 2) return 0;
  const joined = row.join(" ").toLowerCase();
  let hits = 0;
  for (const hint of HEADER_HINTS) if (joined.includes(hint)) hits += 1;
  if (hits === 0) return 0;
  // Клітинки заголовка — текст, не числа: рядок даних теж може містити
  // слово «дата» в описі, але майже завжди несе й числа.
  const numericCells = row.filter(
    (c) => /^[-+\s]*[\d\s.,]+$/.test(c.trim()) && c.trim() !== "",
  ).length;
  return hits * 10 + filled - numericCells * 3;
}

/**
 * Індекс рядка з назвами колонок. Скан перших `HEADER_SCAN_ROWS`; за
 * відсутності кандидата зі знайомими словами — перший непорожній рядок
 * (тобто рівно та сама поведінка, що була до появи цього модуля).
 */
export function locateHeaderRow(rows: string[][]): number {
  let bestIdx = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);

  for (let i = 0; i < limit; i += 1) {
    const row = rows[i]!;
    if (isBlankRow(row)) continue;
    if (bestIdx === -1) bestIdx = i; // fallback: перший непорожній
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? 0 : bestIdx;
}

// ───────────────────────────── Format detect ─────────────────────────────

const OLE2_MAGIC = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

function isLegacyXls(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(OLE2_MAGIC);
}

function isPdf(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.toString("latin1", 0, 4) === "%PDF";
}

/**
 * Байти файлу → сітка. Кидає `ValidationError` з дією для користувача (а не
 * технічним текстом) на форматах, які цей шлях свідомо не читає.
 */
export function gridFromStatementFile(bytes: Buffer): StatementGrid {
  if (bytes.byteLength === 0) {
    throw new ValidationError("Порожній файл.");
  }
  if (bytes.byteLength > STATEMENT_MAX_FILE_BYTES) {
    throw new ValidationError("Файл завеликий (максимум 5 МБ).");
  }
  if (isPdf(bytes)) {
    throw new ValidationError(
      "PDF-виписки поки не читаю. Візьми в банку той самий період у форматі XLSX або CSV.",
    );
  }
  if (isLegacyXls(bytes)) {
    throw new ValidationError(
      "Це старий формат .xls (Excel 97). Відкрий файл у Excel чи Google Таблицях і збережи як .xlsx або .csv.",
    );
  }

  if (looksLikeZip(bytes)) {
    try {
      const rows = xlsxToGrid(bytes);
      return {
        rows,
        sourceKind: "sheet",
        headerRowIndex: locateHeaderRow(rows),
      };
    } catch (err) {
      throw new ValidationError(
        err instanceof XlsxFormatError
          ? "Не вдалось прочитати книгу Excel. Перезбережи файл як .xlsx або .csv."
          : "Не вдалось прочитати файл виписки.",
      );
    }
  }

  const text = decodeStatementText(bytes);
  if (!text.trim()) throw new ValidationError("Порожній файл.");

  if (looksLikeHtmlTable(text)) {
    const rows = htmlTableToGrid(text);
    if (rows.length === 0) {
      throw new ValidationError(
        "У файлі немає таблиці з операціями. Завантаж виписку у форматі XLSX або CSV.",
      );
    }
    return { rows, sourceKind: "csv", headerRowIndex: locateHeaderRow(rows) };
  }

  return gridFromCsvText(text);
}

/** Текстовий CSV → сітка (окремий вхід: `csv_text` лишається в контракті
 * запиту як був — старі клієнти й тести ним користуються). */
export function gridFromCsvText(text: string): StatementGrid {
  const rows = tokenizeCsv(text, detectDelimiterByStructure(text));
  return { rows, sourceKind: "csv", headerRowIndex: locateHeaderRow(rows) };
}
