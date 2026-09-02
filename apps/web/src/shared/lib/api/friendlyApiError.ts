/**
 * Спільний мапер HTTP-статусу у юзер-френдлі українське повідомлення.
 *
 * Обробляє ті кейси, що ідентичні в усіх доменах (auth / rate-limit /
 * дефолт). Доменно-специфічні рядки (nutrition photo 413, AI_QUOTA у
 * чаті, різний текст для 500-без-ключа) живуть у відповідних обгортках
 * (див. `src/modules/nutrition/lib/nutritionErrors.ts` і
 * `src/core/lib/hubChatUtils.ts`), які викликають `friendlyApiError`
 * як fallback.
 */
export function friendlyApiError(
  status: number,
  message?: string | null,
): string {
  const m = message || "";
  // AI-3 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`) —
  // сервер (`rateLimitExpress`, `apps/server/src/http/rateLimit.ts`) тепер
  // сам називає конкретний час очікування («Забагато запитів. Спробуй
  // через 12 секунд.»), а не голе «пізніше»; віддаємо це повідомлення як
  // є замість фіксованого тексту. Фолбек лишається на випадок, якщо
  // сервер (або будь-який інший 429-джерело поза `rateLimitExpress`)
  // з якоїсь причини не передав `message`.
  if (status === 429) return m || "Забагато запитів. Спробуй через хвилину.";
  if (status === 401 || status === 403) return "Доступ заборонено.";
  return m || `Помилка ${status}`;
}
