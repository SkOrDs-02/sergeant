/**
 * PostHog → AI memory sync (web side, PR-24).
 *
 * Контекст: PostHog ловить product events (`onboarding_completed`,
 * `first_action_completed`, `signup_completed`, `subscription_started`)
 * у PR-06/07/08/09. Ці події живуть у PostHog-instance і недосяжні для
 * AI memory `/recall`, тож founder не може запитати «коли я останній
 * раз активувався у фінику?» — мемор з product-боку порожня.
 *
 * Цей модуль — fire-and-forget dual-fire shim: для allowlisted-event
 * робить POST на `/api/ai-memory/event-sync`. Server transforms event +
 * payload у structured-text, scrubPII, enqueue-ить у memory ingest queue
 * як `source='product'`.
 *
 * Контракт: НІКОЛИ не кидає (`trackEvent` обіцяє це call-site-ам). HTTP
 * failures swallow-аться, server side rate-limit (4xx) — теж тихий no-op.
 *
 * ─── Чому allowlist у web ─────────────────────────────────────────
 *
 * `trackEvent` дрібниться на десятки analytics events. Дзвонити server-
 * у на всі — лишній DoS + 200/`ok:false` від server-у. Allowlist у web
 * — perf-shortcut: пропускаємо непотрібний network-trip навіть для
 * подій, які server відхилить. Сервер далі має свій authoritative
 * allowlist (`PRODUCT_MEMORY_EVENTS`), тож якщо web-allowlist розійдеться
 * — це лише missed-sync, ніколи false-positive.
 */

import { ANALYTICS_EVENTS } from "@sergeant/shared";

/**
 * Web-side allowlist подій, що дзеркаляться у `ai_memories` як
 * `source='product'`. ПОВИНЕН бути підмножиною server-side
 * `PRODUCT_MEMORY_EVENTS` (`apps/server/src/modules/ai-memory/eventSync.ts`),
 * інакше server відхилить з 200/`ok:false` — це не шкодить, але
 * додає лишній network-roundtrip.
 *
 * Якщо додаєш new entry — синхронізуй з server-side `EVENT_FORMATTERS`
 * (інакше event прилетить, але server не знатиме, як його зреймити).
 */
export const PRODUCT_MEMORY_SYNC_EVENTS: ReadonlySet<string> = new Set([
  ANALYTICS_EVENTS.SIGNUP_COMPLETED,
  ANALYTICS_EVENTS.ONBOARDING_COMPLETED,
  ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED,
  // `subscription_started` fire-иться зі stripe-webhook (server) — тут
  // у allowlist на випадок, якщо у майбутньому web почне його track-ати
  // на client-side (наприклад success-redirect).
  ANALYTICS_EVENTS.SUBSCRIPTION_STARTED,
]);

const SYNC_URL = "/api/ai-memory/event-sync";

/**
 * Чи слід дзеркалити цю подію у AI memory. Стабільний predicate —
 * test-friendly (важливо, бо реальний viability-залежить від
 * `PRODUCT_MEMORY_SYNC_EVENTS`, що може ростати).
 */
export function shouldSyncEventToMemory(eventName: string): boolean {
  return PRODUCT_MEMORY_SYNC_EVENTS.has(eventName);
}

/**
 * Fire-and-forget HTTP POST. Не повертає Promise — caller-у нема чого
 * await-ити. Усі помилки swallow-аться (network drop, 4xx, 5xx, AbortError).
 *
 * Auth: `credentials: "include"` — Better Auth session cookie.
 * CSRF: `X-Requested-With: XMLHttpRequest` за конвенцією server-у
 * (`apps/server/src/http/csrf.ts` exempt-ить XHR-маркер).
 * Reliability: `keepalive: true` — браузер довершить запит навіть якщо
 * tab закриється під час події (важливо для `onboarding_completed`,
 * де founder одразу йде на dashboard).
 */
export function syncEventToMemory(
  eventName: string,
  payload: Record<string, unknown> = {},
): void {
  if (!eventName || typeof eventName !== "string") return;
  if (!shouldSyncEventToMemory(eventName)) return;
  if (typeof fetch !== "function") return;

  // Захист тестового середовища (jsdom): не вирубаємо тести
  // network-call-ом коли test setup не мокнув fetch.
  if (typeof window === "undefined") return;

  const body = JSON.stringify({ eventName, payload });

  try {
    void fetch(SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body,
      keepalive: true,
      credentials: "include",
    }).catch(() => {
      /* PostHog → memory sync — best-effort; failures NEVER break
         analytics call-site-ів. */
    });
  } catch {
    /* noop — fetch() throw на edge-кейсах (CSP, locked tab) */
  }
}
