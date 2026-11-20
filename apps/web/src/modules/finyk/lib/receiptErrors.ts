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
import { messages } from "@shared/i18n/uk";
import {
  isImageValidationErrorBody,
  type ImageValidationErrorBody,
} from "@sergeant/api-client";

/** Код серверної відмови `POST /api/finyk/receipts` для чека з фото з
 * сумою 0 (`apps/server/src/modules/finyk/receipts/save.ts`). */
export const RECEIPT_TOTAL_REQUIRED_CODE = "RECEIPT_TOTAL_REQUIRED";

function isReceiptTotalRequired(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === RECEIPT_TOTAL_REQUIRED_CODE
  );
}

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
  // Те саме спонукання, що й під полем «Сума» на екрані перевірки: сервер
  // відхилив чек із фото без суми (рішення власника 2026-11-19).
  if (isApiError(err) && isReceiptTotalRequired(err.body)) {
    return messages.finyk.receiptTotal.hint;
  }
  if (
    isApiError(err) &&
    (err.status === 413 || err.status === 415) &&
    isImageValidationErrorBody(err.body)
  ) {
    return imageValidationErrorMessage(err.body);
  }
  return formatApiError(err, { fallback });
}
