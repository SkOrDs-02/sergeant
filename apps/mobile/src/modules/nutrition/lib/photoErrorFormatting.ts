/**
 * Photo-аналіз: мапер помилок у юзер-френдлі український текст.
 *
 * RN-порт логіки web's `nutritionErrors.ts` (`formatNutritionError` →
 * `friendlyApiError`). Тримаємо інлайн-патерн як у `Shopping.tsx`
 * (`formatShoppingApiError`), бо мобільний клієнт ще не має shared
 * `formatApiError`-шару. Тексти для 402/429 (квота), network та 413
 * (завелике фото) збігаються з web-контрактом.
 *
 * Порядок перевірок важливий: спершу `kind` (network/aborted), потім
 * HTTP-статус, далі — серверний / generic fallback.
 */
import { isApiError } from "@sergeant/api-client";

export function formatPhotoApiError(e: unknown, fallback: string): string {
  if (isApiError(e)) {
    if (e.kind === "aborted") return "";
    if (e.kind === "network") {
      return "Немає звʼязку. Перевір інтернет і спробуй ще раз.";
    }
    if (e.status === 402 || e.status === 429) {
      return "Перевищено AI-квоту. Спробуй пізніше.";
    }
    if (e.status === 413) {
      return "Занадто велике фото. Стисни/обріж і спробуй ще раз.";
    }
    if (e.status === 500 && /ANTHROPIC|not set|key/i.test(e.message || "")) {
      return "Сервер харчування не налаштовано (немає ключа AI).";
    }
    return e.serverMessage || e.message || `Помилка ${e.status}`;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
