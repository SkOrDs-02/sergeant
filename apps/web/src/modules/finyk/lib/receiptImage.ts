/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Клієнтська підготовка фото для `POST /api/finyk/receipts/analyze` /
 * `POST /api/finyk/import/screenshot/analyze` — File → base64 + guard на
 * тип/розмір ДО відправки. Дзеркалить патерн nutrition
 * (`modules/nutrition/lib/fileToBase64.ts` + `usePhotoAnalysis.ts::onPickPhoto`),
 * власна копія, а не імпорт із сусіднього модуля — тримає finyk і nutrition
 * незалежними один від одного (module boundaries).
 *
 * 5 МБ на файл — спека § Флоу v1 («≤5MB, стисни/перевір розмір до
 * відправки») і § Фаза 2а («5MB/файл — наявний validateImageBase64-патерн»).
 * Сервер додатково валідує magic-bytes і кап на сам `image_base64`
 * (`ReceiptAnalyzeRequestSchema.image_base64.max(7_000_000)` символів,
 * `packages/shared/src/schemas/receipts.ts`) — цей клієнтський гейт лише
 * рятує від зайвого upload-у явно завеликого файлу, не заміняє серверну
 * перевірку.
 *
 * Перед перевіркою розміру файл проходить `compressImageFile`
 * (`@shared/lib/media/compressImage`): фото з сучасних телефонів
 * (4–6 МБ, часто HEIC) стискаються в JPEG ≤2048px і ліміту більше не
 * торкаються; помилка «Фото завелике» лишається тільки для випадків,
 * коли стиснути не вдалося взагалі.
 */
import { compressImageFile } from "@shared/lib/media/compressImage";

export const RECEIPT_IMAGE_MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface ReceiptImagePayload {
  image_base64: string;
  mime_type: string;
}

export type ReceiptImageReadResult =
  { ok: true; payload: ReceiptImagePayload } | { ok: false; error: string };

/** Читає `Blob` як base64 (без `data:...;base64,` префікса). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не вдалося прочитати файл"));
    reader.onload = () => {
      const s = String(reader.result || "");
      const idx = s.indexOf("base64,");
      resolve(idx >= 0 ? s.slice(idx + 7) : s);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Валідує тип/розмір і читає файл у base64-payload, готовий для
 * `analyzeReceipt`/`analyzeImportScreenshot`. Ніколи не кидає — помилки
 * повертаються як `{ok: false, error}` для inline-показу на review-екрані.
 */
export async function readReceiptImageFile(
  file: File,
): Promise<ReceiptImageReadResult> {
  if (!/^image\//.test(file.type || "")) {
    return { ok: false, error: "Обери файл зображення (jpg, png, heic)." };
  }
  // `null` = лишай оригінал (skip або graceful failure декодера) — далі
  // спрацює наявна валідація розміру, як і до появи стиснення.
  const compressed = await compressImageFile(file).catch(() => null);
  const effective = compressed ?? file;
  if (effective.size > RECEIPT_IMAGE_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: "Фото завелике (максимум 5 МБ). Стисни або обери інше.",
    };
  }
  try {
    const base64 = await fileToBase64(effective);
    if (!base64) {
      return { ok: false, error: "Не вдалося прочитати фото. Спробуй ще раз." };
    }
    return {
      ok: true,
      payload: {
        image_base64: base64,
        mime_type: effective.type || "image/jpeg",
      },
    };
  } catch {
    return { ok: false, error: "Не вдалося прочитати фото. Спробуй ще раз." };
  }
}
