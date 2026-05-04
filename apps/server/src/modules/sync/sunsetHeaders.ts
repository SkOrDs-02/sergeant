import type { Request, Response, NextFunction } from "express";

import { logger } from "../../obs/logger.js";

/**
 * RFC 8594 Sunset + Deprecation HTTP headers + RFC 8288 `Link` header для
 * CloudSync v1 (`/api/sync/*`). Цей middleware **тільки оголошує намір**
 * — він не змінює статус-код і не блокує запит. Реальне 410 Gone приходить
 * у Phase 5 (`Initiative 0003`), після того як survey-counter (Phase 1) і
 * `cloudSyncMode` flag (Phase 3) переконають нас, що traffic v1 → 0.
 *
 * Headers, що додаються (на v1 routes):
 *
 * - `Deprecation: true` — RFC 8594 Section 2: "true" sufficient коли deprecation
 *   active without specific date. Завжди.
 * - `Sunset: <HTTP-date>` — RFC 8594 Section 3: фіксована дата T₀, після якої
 *   v1 повертатиме 410 Gone. Емітиться **тільки** якщо `CLOUDSYNC_V1_SUNSET_AT`
 *   env var вказана у форматі ISO 8601 (`YYYY-MM-DD` або `YYYY-MM-DDTHH:mm:ssZ`)
 *   і парситься у валідну дату. Інакше header не додається.
 * - `Link: <…>; rel="successor-version", <…>; rel="deprecation"` — RFC 8288
 *   Section 3. `successor-version` → v2 push endpoint; `deprecation` → ADR.
 *   Завжди.
 *
 * **Чому не дати default-T₀ у коді**: rollout-strategy (Phase 3-5) ще не
 * lock-нута. Завчасно committed-дата = false-promise клієнтам. ADR-0043
 * фіксує T₀ окремим document-amendment-ом коли planning-команда готова.
 *
 * **Cardinality / log-volume**: header set-eри не логуються per-request
 * (їх читає клієнт із response). Замість цього `routes/sync.ts` уже емітить
 * `sync_v1_legacy_clients_total{user_agent_class, app_version, op}` (Phase 1
 * survey counter), що достатнього для tracking-у "хто ще ходить".
 */

let cachedSunsetDate: { raw: string; httpDate: string } | null = null;
let cachedRawEnv: string | undefined;

const SUCCESSOR_PATH = "/api/v2/sync/push";
const DEPRECATION_DOC_PATH =
  "/docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md";

/**
 * Конвертує ISO 8601 у RFC 7231 IMF-fixdate (`Sun, 06 Nov 1994 08:49:37 GMT`).
 * Повертає `null` якщо дата не парситься. Кеш per-process — env var очікуємо
 * static на час життя контейнера (Railway redeploy → fresh process).
 */
export function parseSunsetEnv(
  rawValue: string | undefined,
): { raw: string; httpDate: string } | null {
  if (!rawValue || typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return {
    raw: trimmed,
    httpDate: date.toUTCString(),
  };
}

function resolveSunsetHeader(): { raw: string; httpDate: string } | null {
  const current = process.env.CLOUDSYNC_V1_SUNSET_AT;
  if (current === cachedRawEnv) return cachedSunsetDate;
  cachedRawEnv = current;
  cachedSunsetDate = parseSunsetEnv(current);
  if (current && !cachedSunsetDate) {
    // Mis-configured — log once on startup so SRE catches typos.
    logger.warn({
      msg: "cloudsync_v1_sunset_env_invalid",
      raw: current.slice(0, 64),
    });
  }
  return cachedSunsetDate;
}

/**
 * Build the `Link` header value. Always includes `successor-version` →
 * `/api/v2/sync/push` and `deprecation` → ADR-0043 doc. Both URIs відносні
 * до origin. RFC 8288 дозволяє і absolute, і origin-relative.
 */
export function buildLinkHeader(): string {
  return `<${SUCCESSOR_PATH}>; rel="successor-version", <${DEPRECATION_DOC_PATH}>; rel="deprecation"`;
}

/**
 * Express middleware. Mount **тільки** на `/api/sync/*` (v1) — НЕ на v2.
 * Викликає `res.setHeader()` перед handler-ом; якщо handler пізніше зробить
 * `res.removeHeader()` — це його право (наприклад, для streaming endpoint).
 *
 * Idempotent: setHeader перезаписує попереднє значення без помилки. Якщо
 * проксі додасть власний `Sunset:` — наш виграє (downstream order).
 */
export function v1SunsetHeadersMiddleware() {
  return (_req: Request, res: Response, next: NextFunction): void => {
    try {
      res.setHeader("Deprecation", "true");
      res.setHeader("Link", buildLinkHeader());
      const sunset = resolveSunsetHeader();
      if (sunset) {
        res.setHeader("Sunset", sunset.httpDate);
      }
    } catch {
      /* headers must never break a request */
    }
    next();
  };
}

/**
 * Test-only: invalidate the resolution cache. Production не викликає це —
 * env очікуємо static.
 */
export function __resetSunsetCacheForTest(): void {
  cachedSunsetDate = null;
  cachedRawEnv = undefined;
}
