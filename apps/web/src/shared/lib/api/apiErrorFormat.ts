/**
 * Єдиний форматер помилок для `useMutation.onError` / `useQuery.error`.
 *
 * Мета — прибрати розсіяний по модулях патерн
 *   `setErr(err?.message || "Fallback")`,
 * який ламається на `ApiError` (у ньому `message` це сире "HTTP 503"),
 * не розрізняє офлайн/auth/5xx і показує різні тексти для одного й того
 * ж кейсу. Правила форматера збігаються з тим, що робить
 * `modules/nutrition/lib/nutritionApi.ts`-адаптер (див. його JSDoc), але
 * живуть у shared-шарі, без прив'язки до домену.
 *
 * Використання у хуку з доменно-специфічними текстами:
 *
 * ```ts
 * onError: (err) =>
 *   setErr(formatApiError(err, {
 *     fallback: "Помилка аналізу фото",
 *     httpStatusToMessage: nutritionFriendlyApiError,
 *   })),
 * ```
 *
 * Kind=`aborted` повертає порожній рядок — `onError` не має що показувати,
 * бо запит скасовано свідомо (unmount, новий `signal`).
 */

import { isApiError } from "@shared/api";
import { friendlyApiError } from "./friendlyApiError";

export interface FormatApiErrorOptions {
  /** Текст, що показуємо, якщо нічого кращого витягти не вдалось. */
  fallback?: string;
  /**
   * Доменно-специфічний маппер HTTP-статусу у повідомлення
   * (напр. nutrition 413 → «Занадто велике фото»). За замовчуванням —
   * `friendlyApiError` з `@shared/lib/friendlyApiError`.
   */
  httpStatusToMessage?: (status: number, serverMessage?: string) => string;
}

const DEFAULT_FALLBACK = "Щось пішло не так. Спробуй ще раз.";

export function formatApiError(
  err: unknown,
  options: FormatApiErrorOptions = {},
): string {
  const fallback = options.fallback || DEFAULT_FALLBACK;
  const mapHttp = options.httpStatusToMessage ?? friendlyApiError;

  if (isApiError(err)) {
    if (err.kind === "aborted") return "";
    if (err.kind === "network") {
      if (err.isOffline) {
        const base = "Немає підключення до інтернету. Спробуй пізніше.";
        return err.requestId ? `${base} (requestId: ${err.requestId})` : base;
      }
      const base = err.message || "Не вдалося зʼєднатися із сервером.";
      return err.requestId ? `${base} (requestId: ${err.requestId})` : base;
    }
    if (err.kind === "parse") {
      // Типовий кейс на Vercel: rewrite перехоплює `/api/*` і повертає index.html.
      if (/<!doctype html/i.test(err.bodyText || "")) {
        const base =
          "API повернув HTML замість JSON (ймовірно, rewrite перехоплює /api/*).";
        return err.requestId ? `${base} (requestId: ${err.requestId})` : base;
      }
      const base = err.message || err.bodyText || fallback;
      return err.requestId ? `${base} (requestId: ${err.requestId})` : base;
    }
    // kind === "http"
    const httpMsg = mapHttp(err.status, err.serverMessage);
    // Якщо сервер не дав свого тексту, а мапер впав у загальний
    // «Помилка <status>» — віддаємо caller-специфічний fallback
    // (контекстний текст типу «Помилка генерації звіту» корисніший
    // за голий код статусу). Спеціальні мапери для 401/429/413
    // тут не зачіпаються, бо вони повертають конкретні фрази.
    if (
      options.fallback !== undefined &&
      !err.serverMessage &&
      /^Помилка \d+$/.test(httpMsg)
    ) {
      const base = options.fallback;
      return err.requestId ? `${base} (requestId: ${err.requestId})` : base;
    }
    const base = httpMsg || fallback;
    return err.requestId ? `${base} (requestId: ${err.requestId})` : base;
  }

  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
