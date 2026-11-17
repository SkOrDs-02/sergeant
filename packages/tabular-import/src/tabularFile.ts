import { isBlankRow, tokenizeCsv, type CsvDelimiter } from "./csvParser.js";
import {
  HtmlFormatError,
  htmlTableToGrid,
  looksLikeHtmlTable,
} from "./htmlTableGrid.js";
import { looksLikeZip } from "./zipReader.js";
import { XlsxFormatError, xlsxToGrid } from "./xlsxGrid.js";

export type TabularSourceKind = "csv" | "sheet";

export interface TabularGrid {
  rows: string[][];
  sourceKind: TabularSourceKind;
  /** 0-based індекс рядка з назвами колонок усередині `rows`. */
  headerRowIndex: number;
}

export const TABULAR_MAX_FILE_BYTES = 5 * 1024 * 1024;

const HEADER_SCAN_ROWS = 30;

export type TabularImportErrorCode =
  | "empty_file"
  | "too_large"
  | "too_many_rows"
  | "pdf_not_supported"
  | "legacy_xls"
  | "unreadable_workbook"
  | "unreadable_table"
  | "no_table";

export class TabularImportError extends Error {
  constructor(readonly code: TabularImportErrorCode) {
    super(code);
  }
}

export function decodeTabularText(bytes: Buffer): string {
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

const CANDIDATES: readonly CsvDelimiter[] = [",", ";", "\t"];
const DELIMITER_SAMPLE_BYTES = 64 * 1024;

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

/** `^[-+\s]*[\d\s.,]+$`, але знак захоплюється атомарно (lookahead +
 * зворотне посилання): обидва класи містять `\s`, і звичайний варіант на
 * клітинці `"-" + 5 МБ пробілів + "x"` перебирав би кожну точку поділу
 * пробілів між ними, тобто квадратичний час. На обрізаному рядку
 * результат той самий. */
const NUMERIC_CELL_RE = /^(?=([-+\s]*))\1[\d\s.,]+$/;

function headerScore(row: string[], hints: readonly string[]): number {
  const filled = row.filter((c) => c.trim() !== "").length;
  if (filled < 2) return 0;
  const joined = row.join(" ").toLowerCase();
  let hits = 0;
  for (const hint of hints) if (joined.includes(hint)) hits += 1;
  if (hits === 0) return 0;
  const numericCells = row.filter(
    (c) => NUMERIC_CELL_RE.test(c.trim()) && c.trim() !== "",
  ).length;
  return hits * 10 + filled - numericCells * 3;
}

export function locateHeaderRow(
  rows: string[][],
  hints: readonly string[],
): number {
  let bestIdx = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);

  for (let i = 0; i < limit; i += 1) {
    const row = rows[i]!;
    if (isBlankRow(row)) continue;
    if (bestIdx === -1) bestIdx = i;
    const score = headerScore(row, hints);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? 0 : bestIdx;
}

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
 * Скільки рядків сітки розбирати, щоб перевищення `maxDataRows` було
 * видно без розбору решти файлу: шапка стоїть не нижче
 * `HEADER_SCAN_ROWS`, тож сітка з такою кількістю рядків уже має
 * понад `maxDataRows` рядків даних.
 */
function gridRowLimit(maxDataRows: number | undefined): number {
  return maxDataRows === undefined
    ? Number.POSITIVE_INFINITY
    : maxDataRows + HEADER_SCAN_ROWS + 1;
}

function withinRowLimit(rows: string[][], limit: number): string[][] {
  if (rows.length >= limit) throw new TabularImportError("too_many_rows");
  return rows;
}

/**
 * `maxDataRows` - стеля рядків даних. Без неї 5 МБ переносів рядка чи
 * `<row/>` будують мільйони масивів до того, як викликач порахує рядки;
 * з нею розбір зупиняється одразу за межею і кидає `too_many_rows`.
 */
export function gridFromTabularFile(
  bytes: Buffer,
  hints: readonly string[],
  maxDataRows?: number,
): TabularGrid {
  if (bytes.byteLength === 0) {
    throw new TabularImportError("empty_file");
  }
  if (bytes.byteLength > TABULAR_MAX_FILE_BYTES) {
    throw new TabularImportError("too_large");
  }
  if (isPdf(bytes)) {
    throw new TabularImportError("pdf_not_supported");
  }
  if (isLegacyXls(bytes)) {
    throw new TabularImportError("legacy_xls");
  }
  const limit = gridRowLimit(maxDataRows);

  if (looksLikeZip(bytes)) {
    let rows: string[][];
    try {
      rows = xlsxToGrid(bytes, limit);
    } catch (err) {
      if (err instanceof XlsxFormatError) {
        throw new TabularImportError("unreadable_workbook");
      }
      throw new TabularImportError("unreadable_table");
    }
    withinRowLimit(rows, limit);
    return {
      rows,
      sourceKind: "sheet",
      headerRowIndex: locateHeaderRow(rows, hints),
    };
  }

  const text = decodeTabularText(bytes);
  if (!text.trim()) throw new TabularImportError("empty_file");

  if (looksLikeHtmlTable(text)) {
    let rows: string[][];
    try {
      rows = htmlTableToGrid(text, limit);
    } catch (err) {
      if (err instanceof HtmlFormatError) {
        throw new TabularImportError("unreadable_table");
      }
      throw new TabularImportError("unreadable_table");
    }
    if (rows.length === 0) {
      throw new TabularImportError("no_table");
    }
    withinRowLimit(rows, limit);
    return {
      rows,
      sourceKind: "csv",
      headerRowIndex: locateHeaderRow(rows, hints),
    };
  }

  return gridFromCsvText(text, hints, maxDataRows);
}

export function gridFromCsvText(
  text: string,
  hints: readonly string[],
  maxDataRows?: number,
): TabularGrid {
  const limit = gridRowLimit(maxDataRows);
  const rows = withinRowLimit(
    tokenizeCsv(text, detectDelimiterByStructure(text), limit),
    limit,
  );
  return {
    rows,
    sourceKind: "csv",
    headerRowIndex: locateHeaderRow(rows, hints),
  };
}
