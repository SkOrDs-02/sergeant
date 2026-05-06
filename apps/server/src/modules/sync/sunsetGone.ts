import type { Request, Response } from "express";

import { logger } from "../../obs/logger.js";

/**
 * `requireSession()` (mounted in `routes/sync.ts`) populates `req.user` із
 * resolved `SessionUser`. Локальний type-augment-нарок використовуємо як
 * це робиться у `requireVerifiedEmail.ts` — саме шляхом intersection-у з
 * `Request`, без global module-augmentation і без `any`.
 */
type AuthedRequest = Request & {
  user?: { id?: string };
};

/**
 * CloudSync v1 — T₀ executed handler. Returns `410 Gone` із RFC-8594-style
 * body для всіх write/read endpoint-ів `/api/sync/{push,pull,pull-all,push-all}`.
 *
 * **Ціль (Initiative 0003 Phase 5)**: після того як Phase 1 (survey) і
 * Phase 2 (`Sunset:` + `Deprecation:` + `Link:` headers) показали, що
 * legacy traffic можна знімати, цей handler перетворює оголошений намір
 * на реальне server-side rejection. v2 (`/api/v2/sync/*`) лишається
 * єдиним sync-каналом.
 *
 * **Що повертаємо** (RFC 9110 Section 15.5.11 + RFC 8594 Section 4):
 *
 * ```json
 * {
 *   "error": "cloudsync_v1_sunset",
 *   "successor": "/api/v2/sync",
 *   "since": "<ISO-8601>",
 *   "guide": "/docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md"
 * }
 * ```
 *
 * - `since` береться з `CLOUDSYNC_V1_GONE_SINCE` env var (ISO 8601). Якщо
 *   env не виставлено або не парситься — fallback `"unknown"`. Це поле
 *   важливе для клієнтів, що логують sunset-events для retry-decay logic.
 * - `successor` — origin-relative path до v2 push endpoint-а; клієнт може
 *   resolve-ити його проти `req.host`.
 * - `guide` — посилання на initiative-документ із повним rollout-планом
 *   і migration-runbook-ом (для людей, не для автоматики).
 *
 * **Headers**:
 *
 * - `Cache-Control: no-store` — щоб proxy/CDN не закешували 410 і не
 *   зламали потенційний rollback (recovery PR має зняти 410 миттєво).
 * - `Sunset:` / `Deprecation:` / `Link:` — додаються `v1SunsetHeadersMiddleware`
 *   вище в pipeline, цей handler їх НЕ перезаписує.
 *
 * **Logging**: один structured-log-event `cloudsync_v1_gone_response` per
 * request — щоб у Grafana бачити хто ще б'ється у sunset-канал. Не
 * Sentry-метрика (вони очікувані, не аномалія). User-id, app-version,
 * UA-class — мінімальний набір для post-mortem.
 *
 * **Чому не 404 / 405 / 426**: 410 Gone — RFC-семантика "permanently
 * removed; resource will not return". Saml-сигнал клієнтам не retry-ити
 * і відключити sync-canал назавжди. 404 двозначне (могло бути typo);
 * 405 неправильне (route не "wrong method", вона не існує більше); 426
 * Upgrade Required описує protocol upgrade, не path migration.
 */

interface SunsetResponseBody {
  readonly error: "cloudsync_v1_sunset";
  readonly successor: "/api/v2/sync";
  readonly since: string;
  readonly guide: string;
}

const SUCCESSOR_PATH = "/api/v2/sync" as const;
const GUIDE_PATH =
  "/docs/initiatives/0003-sync-v2-rollout-and-v1-sunset.md" as const;

let cachedSinceEnv: string | undefined;
let cachedSinceValue: string = "unknown";

/**
 * Resolves `CLOUDSYNC_V1_GONE_SINCE` env var to an ISO 8601 string. Cached
 * per-process (env vars don't change in-flight). Fallback `"unknown"` if
 * unset or unparseable, so the response shape is always stable.
 */
export function resolveSunsetSince(): string {
  const current = process.env["CLOUDSYNC_V1_GONE_SINCE"];
  if (current === cachedSinceEnv) return cachedSinceValue;
  cachedSinceEnv = current;
  if (!current || typeof current !== "string") {
    cachedSinceValue = "unknown";
    return cachedSinceValue;
  }
  const trimmed = current.trim();
  if (!trimmed) {
    cachedSinceValue = "unknown";
    return cachedSinceValue;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    logger.warn({
      msg: "cloudsync_v1_gone_since_env_invalid",
      raw: trimmed.slice(0, 64),
    });
    cachedSinceValue = "unknown";
    return cachedSinceValue;
  }
  cachedSinceValue = date.toISOString();
  return cachedSinceValue;
}

/**
 * Test-only: clear the resolution cache. Production code never calls this.
 */
export function __resetSunsetSinceCacheForTests(): void {
  cachedSinceEnv = undefined;
  cachedSinceValue = "unknown";
}

export function respondV1Gone(req: Request, res: Response): void {
  const body: SunsetResponseBody = {
    error: "cloudsync_v1_sunset",
    successor: SUCCESSOR_PATH,
    since: resolveSunsetSince(),
    guide: GUIDE_PATH,
  };

  // requestContext has a `setRequestModule("sync")` already from the v1
  // mount in routes/sync.ts; we reuse it for the structured-log tag.
  const userIdRaw = (req as AuthedRequest).user?.id;
  const userId = typeof userIdRaw === "string" ? userIdRaw : null;

  logger.info({
    msg: "cloudsync_v1_gone_response",
    path: req.originalUrl ?? req.url,
    method: req.method,
    userId,
    userAgent: req.headers["user-agent"]
      ? String(req.headers["user-agent"]).slice(0, 256)
      : null,
    appVersion:
      typeof req.headers["x-app-version"] === "string"
        ? req.headers["x-app-version"].slice(0, 64)
        : null,
  });

  res.setHeader("Cache-Control", "no-store");
  res.status(410).json(body);
}
