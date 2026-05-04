/**
 * URL-path redaction для шляхів, де частина URL — це сам секрет.
 *
 * Контекст (C1 — `docs/security/hardening/C1-mono-webhook-secret-in-url.md`).
 * Monobank історично доставляє webhook на `POST /api/mono/webhook/<secret>`,
 * де `<secret>` — той самий рядок, що валідує запит. Якщо такий URL потрапить
 * у:
 *   - error-логи (errorHandler fallback на `req.originalUrl`),
 *   - Sentry `event.request.url` / breadcrumb `data.url`,
 *   - будь-який payload, де ми за помилкою серіалізуємо `req`,
 *
 * — секрет одразу витікає у read-only-системи з 30-day retention. Цей хелпер
 * — defense-in-depth поверх primary-фіксу (нова прийомка через
 * `X-Mono-Webhook-Secret` header, див. `modules/mono/webhook.ts`). Поки
 * Monobank ще шле path-secret, ми **обов'язково** ганяємо кожний URL, що
 * піде у лог/Sentry, через `redactSensitiveUrl()`.
 *
 * Контракт:
 *   - вхід `null/undefined/""` → `""` (нормалізація для логів, які люблять
 *     fallback на пустий рядок);
 *   - URL з відомим секрет-prefix-ом → секрет замінюється на `[redacted]`,
 *     query-string зберігається;
 *   - усі інші URL — повертаються as-is, без копіювання.
 */

const REDACTED_PLACEHOLDER = "[redacted]";

/**
 * Префікси шляхів, де наступний path-сегмент — секрет.
 *
 * `apiVersionRewrite` нормалізує `/api/v1/...` → `/api/...` ДО того, як
 * хендлери щось логують, але цей хелпер також треба викликати з
 * Sentry-контексту, де `event.request.url` буде сирим (Sentry бере його з
 * `req.originalUrl` через `requestDataIntegration`, і той бачить `/api/v1/`
 * до rewrite-у). Тому ловимо обидва префікси.
 */
const SENSITIVE_PATH_PREFIXES = [
  "/api/mono/webhook/",
  "/api/v1/mono/webhook/",
] as const;

/**
 * Замінює секрет у URL-path-і на `[redacted]`. Зберігає query-string і
 * fragment, якщо вони є.
 *
 * Приклади:
 *   `/api/mono/webhook/abc123`           → `/api/mono/webhook/[redacted]`
 *   `/api/mono/webhook/abc123?retry=1`   → `/api/mono/webhook/[redacted]?retry=1`
 *   `/api/v1/mono/webhook/abc123`        → `/api/v1/mono/webhook/[redacted]`
 *   `/api/me`                            → `/api/me` (без змін)
 *   `""`/`null`/`undefined`              → `""`
 */
export function redactSensitiveUrl(url: string | undefined | null): string {
  if (!url) return "";

  // Розділяємо path і query/fragment один раз. Express зазвичай дає
  // `req.originalUrl` без фрагменту, але Sentry-payload може мати повний
  // URL із фрагментом — тримаємо це у `tail`.
  const queryIdx = url.search(/[?#]/);
  const pathPart = queryIdx >= 0 ? url.slice(0, queryIdx) : url;
  const tailPart = queryIdx >= 0 ? url.slice(queryIdx) : "";

  for (const prefix of SENSITIVE_PATH_PREFIXES) {
    if (pathPart.startsWith(prefix)) {
      // Якщо після prefix-у нічого нема — лишаємо як є (помилковий запит,
      // нема чого редагувати).
      const rest = pathPart.slice(prefix.length);
      if (rest === "") return url;
      // Якщо у rest є ще `/` — редагуємо лише перший сегмент, лишаючи
      // потенційний suffix (на майбутнє, якщо колись будуть під-роути).
      const slashIdx = rest.indexOf("/");
      if (slashIdx >= 0) {
        return `${prefix}${REDACTED_PLACEHOLDER}${rest.slice(slashIdx)}${tailPart}`;
      }
      return `${prefix}${REDACTED_PLACEHOLDER}${tailPart}`;
    }
  }
  return url;
}
