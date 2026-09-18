import {
  decodeTabularText,
  detectDelimiterByStructure,
  gridFromCsvText as gridFromTabularCsvText,
  gridFromTabularFile,
  locateHeaderRow as locateTabularHeaderRow,
  TABULAR_MAX_FILE_BYTES,
  TabularImportError,
  type TabularGrid,
  type TabularImportErrorCode,
  type TabularSourceKind,
} from "@sergeant/tabular-import";
import { ValidationError } from "../../../obs/errors.js";

export type StatementSourceKind = TabularSourceKind;
export type StatementGrid = TabularGrid;

export const STATEMENT_MAX_FILE_BYTES = TABULAR_MAX_FILE_BYTES;
export const decodeStatementText = decodeTabularText;
export { detectDelimiterByStructure };

/** Фрагменти, які зустрічаються в шапці банківської виписки. */
export const HEADER_HINTS = [
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
] as const;

const TABULAR_ERROR_MESSAGES = {
  empty_file: "Порожній файл.",
  too_large: "Файл завеликий (максимум 5 МБ).",
  pdf_not_supported:
    "PDF-виписки поки не читаю. Візьми в банку той самий період у форматі XLSX або CSV.",
  legacy_xls:
    "Це старий формат .xls (Excel 97). Відкрий файл у Excel чи Google Таблицях і збережи як .xlsx або .csv.",
  unreadable_workbook:
    "Не вдалось прочитати книгу Excel. Перезбережи файл як .xlsx або .csv.",
  unreadable_table:
    "Не вдалось прочитати таблицю у файлі. Завантаж виписку у форматі XLSX або CSV.",
  no_table:
    "У файлі немає таблиці з операціями. Завантаж виписку у форматі XLSX або CSV.",
} satisfies Record<TabularImportErrorCode, string>;

function toValidationError(err: TabularImportError): ValidationError {
  return new ValidationError(TABULAR_ERROR_MESSAGES[err.code]);
}

export function locateHeaderRow(rows: string[][]): number {
  return locateTabularHeaderRow(rows, HEADER_HINTS);
}

export function gridFromStatementFile(bytes: Buffer): StatementGrid {
  try {
    return gridFromTabularFile(bytes, HEADER_HINTS);
  } catch (err) {
    if (err instanceof TabularImportError) {
      throw toValidationError(err);
    }
    throw err;
  }
}

export function gridFromCsvText(text: string): StatementGrid {
  return gridFromTabularCsvText(text, HEADER_HINTS);
}
