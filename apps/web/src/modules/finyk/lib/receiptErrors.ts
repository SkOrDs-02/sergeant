/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Error-форматер для чек-скан / масовий-імпорт мутацій. Більшість
 * ендпоінтів `finyk.receipts`/`finyk.import` уже віддають людське укр.
 * повідомлення в стандартному envelope (`err.serverMessage` —
 * `DPS_TOKEN_MISSING`, `DPS_RECEIPT_NOT_FOUND` тощо, спека § Флоу v1) —
 * `formatApiError` (shared) уже показує його як є. Єдиний виняток —
 * `413`/`415` на `analyzeReceipt`/`analyzeImportScreenshot`: нестандартний
 * envelope (`ImageValidationErrorBody`, `packages/api-client`), який
 * `formatApiError` не вміє розпарсити — обробляємо тут окремо.
 */
import { isApiError } from "@shared/api";
import { formatApiError } from "@shared/lib/api/apiErrorFormat";
import {
  isImageValidationErrorBody,
  type ImageValidationErrorBody,
} from "@sergeant/api-client";

function imageValidationErrorMessage(body: ImageValidationErrorBody): string {
  switch (body.code) {
    case "TOO_LARGE":
      return "Фото завелике (максимум 5 МБ). Стисни або обери інше.";
    case "INVALID_BASE64":
      return "Не вдалося прочитати фото. Спробуй ще раз.";
    case "TRUNCATED":
      return "Фото завантажилось не повністю. Спробуй ще раз.";
    case "MAGIC_MISMATCH":
      return "Файл не схожий на зображення. Обери інший.";
    default:
      return "Не вдалося обробити фото. Спробуй ще раз.";
  }
}

/**
 * Форматер для `useMutation.onError` чек-скан/імпорт-хуків. `fallback`
 * лишається тим самим контрактом, що загальний `formatApiError`.
 */
export function formatReceiptError(err: unknown, fallback: string): string {
  if (
    isApiError(err) &&
    (err.status === 413 || err.status === 415) &&
    isImageValidationErrorBody(err.body)
  ) {
    return imageValidationErrorMessage(err.body);
  }
  return formatApiError(err, { fallback });
}
