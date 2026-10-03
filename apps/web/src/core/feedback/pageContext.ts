/**
 * @status Active
 * @owner @Skords-01
 */
import { sanitizeUrl } from "../observability/sanitizeUrl";

/**
 * Опціональний «скріншот-контекст» сторінки для feedback-віджета
 * (GTM § 3.2). НЕ справжній скріншот: реальні pixel-и тягнуть PII
 * (баланси, назви транзакцій) і мегабайти payload-у, тому контекст —
 * це мінімальний відтворюваний опис, з якого можна повторити баг:
 *
 *   - `page` — поточний href через `sanitizeUrl()` (той самий
 *     санітайзер, що й `$current_url` у `PageviewTracker` — magic-link
 *     токени / OAuth-коди ніколи не потрапляють у PostHog);
 *   - `viewport` — "WxH" CSS-пікселів, щоб відрізнити mobile-layout
 *     баги від desktop-них.
 *
 * Платформу окремо не дублюємо — `platform` / `is_capacitor` вже
 * зареєстровані як PostHog super properties у `initPostHog()`.
 */
export interface FeedbackPageContext {
  page: string;
  viewport: string;
}

export function buildPageContext(): FeedbackPageContext | null {
  try {
    if (typeof window === "undefined") return null;
    return {
      page: sanitizeUrl(window.location.href),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
  } catch {
    // Фідбек важливіший за контекст: якщо середовище не дає прочитати
    // location/viewport — повертаємо null і шлемо відгук без контексту.
    return null;
  }
}
