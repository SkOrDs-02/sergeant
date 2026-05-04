import type { RequestHandler } from "express";
import { setCorsHeaders } from "./cors.js";

/**
 * Global CORS middleware для всього `/api`. Раніше жило inline у
 * `server/app.js` і дублювалось у кожному handler-і через `setCorsHeaders` +
 * OPTIONS-guard; PR 4 зробив це єдиним source of truth.
 *
 * `allowHeaders` містить тільки ті хедери, що МАЮТЬ приходити з браузера:
 *   - `X-Token` — nutrition/monobank (proxy)
 *   - `X-Privat-Id`, `X-Privat-Token` — privatbank (proxy)
 *   - `Content-Type` — для POST/JSON
 *
 * `X-Api-Secret` свідомо НЕ в цьому списку: `/api/push/send` — внутрішній
 * cron/worker endpoint, браузер не має могти preflight-нути його навіть з
 * allowed origin (defense-in-depth проти XSS / протечки секрета в logs).
 */
// `Authorization` — мобільні клієнти шлють `Authorization: Bearer <token>`
// через better-auth/bearer плагін. Браузери з cookie-сесіями цей хедер не
// використовують, але додати його у allow-list безпечно: сервер все одно
// валідує токен через better-auth.
const ALLOW_HEADERS =
  "Content-Type, Authorization, X-Token, X-Privat-Id, X-Privat-Token";

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
