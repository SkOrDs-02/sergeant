/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Читання файлу виписки для `POST /api/finyk/import/statement/preview`.
 *
 * Файл їде на сервер СИРИМ (base64), а не текстом. Раніше клієнт робив
 * `file.text()` — і це мовчки ламало два з трьох реальних сценаріїв:
 *   - **XLSX/XLS** текстової форми не має взагалі (таблиця Privat24
 *     перетворювалась на бінарне сміття);
 *   - **CSV у windows-1251** (частий укр. експорт) `file.text()` читає як
 *     UTF-8, тож кирилиця псувалась ЩЕ ДО відправки, жоден заголовок не
 *     матчився, і людина щоразу опинялась у ручному column-mapper-і з
 *     нечитабельними назвами колонок.
 * Формат визначає сервер за magic-байтами (`statementFile.ts`), не за
 * розширенням — банки регулярно віддають HTML-таблицю з іменем `*.xls`.
 */
import { IMPORT_STATEMENT_MAX_CSV_BYTES } from "@sergeant/shared";

export const IMPORT_STATEMENT_MAX_FILE_BYTES = IMPORT_STATEMENT_MAX_CSV_BYTES;

/** `accept` для пікера. Розширення + MIME разом: Android-пікери часто
 * дають порожній `type`, а десктопний Safari — навпаки, лише MIME. */
export const IMPORT_STATEMENT_FILE_ACCEPT = [
  ".csv",
  ".xls",
  ".xlsx",
  ".txt",
  "text/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
].join(",");

/** Розмір порції для `btoa`: `String.fromCharCode(...bytes)` на 5 МБ
 * розкладає стек одним викликом, тож кодуємо шматками. */
const BASE64_CHUNK_BYTES = 0x8000;

/**
 * Байти → base64 через `btoa`, а не через `FileReader.readAsDataURL`.
 * `FileReader` є лише в браузері й jsdom, а `Blob.arrayBuffer()` + `btoa`
 * доступні і в Node-середовищі vitest — тож ця функція тестується без
 * підміни глобалів.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_BYTES));
  }
  return btoa(binary);
}

export interface StatementFilePayload {
  file_base64: string;
  file_name: string;
}

export type ReadStatementFileResult =
  { ok: true; payload: StatementFilePayload } | { ok: false; error: string };

export async function readStatementFile(
  file: File,
): Promise<ReadStatementFileResult> {
  if (file.size === 0) return { ok: false, error: "Порожній файл." };
  if (file.size > IMPORT_STATEMENT_MAX_FILE_BYTES) {
    return { ok: false, error: "Файл завеликий (максимум 5 МБ)." };
  }
  try {
    const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
    if (!base64) return { ok: false, error: "Не вдалося прочитати файл." };
    return {
      ok: true,
      payload: { file_base64: base64, file_name: file.name.slice(0, 255) },
    };
  } catch {
    return { ok: false, error: "Не вдалося прочитати файл." };
  }
}
