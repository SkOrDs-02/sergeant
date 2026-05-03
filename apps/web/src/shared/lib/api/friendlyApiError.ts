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
  if (status === 429) return "Забагато запитів. Спробуй через хвилину.";
  if (status === 401 || status === 403) return "Доступ заборонено.";
  return m || `Помилка ${status}`;
}
