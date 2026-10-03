/**
 * Last validated: 2026-09-23
 * Status: Active
 *
 * Копія збою за каноном §3 («що сталось + що зробити») для фолбеків
 * `formatApiError` / `setErr` / тостів. Один шаблон замість тридцяти
 * «Помилка + іменник» без наступного кроку (аудит копі 2026-09-23 §2.6).
 *
 * `what` в інфінітиві, як продовження «Не вдалося …»: «скласти план»,
 * «підключити Monobank». `action` за замовчуванням «Спробуй ще раз.»;
 * передавай своє, коли повтор не допоможе («Перевір зʼєднання.»).
 *
 * Читає `uk.core`, а не повний каталог: серед споживачів є eager-поверхні
 * (`AuthContext`), а гейт `uk.core.eagerImports.test.ts` не пускає туди
 * `@shared/i18n/uk`.
 */
import { coreMessages } from "./uk.core";

export function failedCopy(
  what: string,
  action: string = coreMessages.errors.generic.retryAction,
): string {
  return coreMessages.errors.generic.failed
    .replace("{what}", what)
    .replace("{action}", action);
}
