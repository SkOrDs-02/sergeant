/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { friendlyApiError as baseFriendlyApiError } from "@shared/lib/api/friendlyApiError";
import { formatApiError } from "@shared/lib/api/apiErrorFormat";
import { messages } from "@shared/i18n/uk";

/**
 * Розбір списку комори не вдався: onSuccess без позицій і onError кажуть
 * одне й те саме (аудит копі 2026-09-23 §2.6). Живе тут, а не в хуку, бо
 * `useNutritionPantries.ts` стоїть рівно на стелі `max-lines: 600`.
 */
export const PARSE_FAILED = messages.nutrition.parseListFailed;

/**
 * Nutrition-специфічний варіант `friendlyApiError`. Додає три речі,
 * яких немає у загальному мапері:
 *  - 500 без ключа AI → окремий текст про «сервер харчування»;
 *  - 413 для завеликого фото → конкретна інструкція;
 *  - 401 → AI-фічі харчування (день/тиждень-план, фото, рецепти) стоять за
 *    `requireSession()`, тож анонімний відвідувач тут отримає саме 401. Базовий
 *    мапер віддав би сухе «Доступ заборонено.» + requestId — нічого не
 *    пояснюючи й не пропонуючи дії. Тут даємо конкретний наступний крок
 *    замість цього.
 *
 * Усе інше (403, 429, дефолт) делегуємо у `@shared/lib/friendlyApiError` —
 * щоб ці статуси поводились однаково по всьому застосунку.
 */
export function friendlyApiError(
  status: number,
  message?: string | null,
): string {
  const m = message || "";
  if (status === 500 && /ANTHROPIC|not set|key/i.test(m)) {
    return "Сервер харчування не налаштовано. Повідом у підтримку.";
  }
  if (status === 413) {
    return "Занадто велике фото. Стисни/обріж і спробуй ще раз.";
  }
  if (status === 401) {
    return "Ця функція працює тільки з обліковим записом. Зареєструйся або увійди (безкоштовно, хвилина) в профілі, і спробуй ще раз.";
  }
  return baseFriendlyApiError(status, message);
}

/**
 * Помічник для `useMutation.onError` у nutrition-хуках. Загортає
 * `formatApiError` з nutrition-специфічним HTTP-маппером — щоб один
 * і той самий 500 «ANTHROPIC key not set» і 413 «занадто велике фото»
 * давав однаковий текст у photo/recipes/week-plan/тощо, без
 * розсипаних `err?.message || "fallback"`-кейсів.
 *
 * Приклад:
 *
 * ```ts
 * onError: (err) => setErr(formatNutritionError(err, "Помилка аналізу фото"))
 * ```
 */
export function formatNutritionError(err: unknown, fallback: string): string {
  return formatApiError(err, {
    fallback,
    httpStatusToMessage: friendlyApiError,
  });
}
