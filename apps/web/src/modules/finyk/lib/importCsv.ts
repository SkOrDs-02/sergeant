/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Читання CSV-файлу виписки для `POST /api/finyk/import/statement/preview`
 * (спека § API-контракт Фази 2: `csv_text` рядком у JSON, кап 5MB —
 * `IMPORT_STATEMENT_MAX_CSV_BYTES`, `packages/shared/src/schemas/import.ts`).
 * Клієнтський гейт лише рятує від зайвого upload-у явно завеликого файлу.
 */

export const IMPORT_CSV_MAX_FILE_BYTES = 5 * 1024 * 1024;

export type ReadCsvResult =
  { ok: true; text: string } | { ok: false; error: string };

export async function readCsvTextFile(file: File): Promise<ReadCsvResult> {
  if (file.size > IMPORT_CSV_MAX_FILE_BYTES) {
    return { ok: false, error: "Файл завеликий (максимум 5 МБ)." };
  }
  try {
    const text = await file.text();
    if (!text.trim()) return { ok: false, error: "Порожній файл." };
    return { ok: true, text };
  } catch {
    return { ok: false, error: "Не вдалося прочитати файл." };
  }
}
