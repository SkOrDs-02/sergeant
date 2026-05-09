import type { RequestHandler } from "express";
import { setCorsHeaders } from "./cors.js";

/**
 * Global CORS middleware для всього `/api`. Раніше жило inline у
 * `server/app.js` і дублювалось у кожному handler-і через `setCorsHeaders` +
 * OPTIONS-guard; PR 4 зробив це єдиним source of truth.
 *
 * `allowHeaders` містить тільки ті хедери, що МАЮТЬ приходити з браузера:
 *   - `Content-Type` — для POST/JSON
 *   - `Authorization` — мобільні клієнти шлють `Authorization: Bearer <token>`
 *     через better-auth/bearer плагін. Браузери з cookie-сесіями цей хедер не
 *     використовують, але додати його у allow-list безпечно: сервер все одно
 *     валідує токен через better-auth.
 *   - `X-Requested-With` — обов'язковий для M10 CSRF guard (`requireCsrfHeader`).
 *     Browser-side fetch виставляє його через `apps/web/src/shared/lib/api/httpClient.ts`
 *     і Better Auth `fetchOptions.headers`. Без нього у allow-list cross-origin
 *     preflight (web :4173 → API :3000 у smoke / dev) валиться, і `/sign-in`
 *     не може реально дзвонити Better Auth.
 *   - `traceparent`, `tracestate` — W3C Trace Context (OTel). Frontend
 *     instrumentation додає їх до cross-origin fetch-ів; без allow-list
 *     preflight рубає state-changing запити, що містять трейс-хедери.
 *   - `X-Token` — nutrition/monobank (proxy)
 *   - `X-Privat-Id`, `X-Privat-Token` — privatbank (proxy)
 *
 * `X-Api-Secret` свідомо НЕ в цьому списку: `/api/push/send` — внутрішній
 * cron/worker endpoint, браузер не має могти preflight-нути його навіть з
 * allowed origin (defense-in-depth проти XSS / протечки секрета в logs).
 */
const ALLOW_HEADERS =
  "Content-Type, Authorization, X-Requested-With, traceparent, tracestate, X-Token, X-Privat-Id, X-Privat-Token";

// `Retry-After` — Monobank-proxy повертає його на 429, щоб клієнт (Monobank
// pagination loop, `api-client/endpoints/mono.ts`) міг зробити targeted
// backoff. Без Expose-Headers JS у cross-origin fetch не бачить заголовка.
const EXPOSE_HEADERS = "Retry-After";

export function apiCorsMiddleware(): RequestHandler {
  return (req, res, next) => {
    setCorsHeaders(res, req, {
      allowHeaders: ALLOW_HEADERS,
      methods: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      exposeHeaders: EXPOSE_HEADERS,
    });
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return;
    }
    next();
  };
}
