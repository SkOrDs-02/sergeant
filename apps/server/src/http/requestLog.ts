import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../obs/logger.js";
import { als } from "../obs/requestContext.js";
import {
  httpErrorsTotal,
  httpInFlight,
  httpRequestDurationMs,
  httpRequestsTotal,
  statusClass,
} from "../obs/metrics.js";
import { elapsedMs } from "../lib/timing.js";

/**
 * Один JSON-рядок на відповідь + емісія HTTP-RED метрик.
 * `requestId`/`userId`/`module` додаються автоматично через ALS у logger.
 *
 * `path` = route pattern (`/api/nutrition/food/:id`), не сирий URL — інакше
 * cardinality метрик вибухне.
 */
/**
 * IP — PII class C, а access-log осідає в Loki/stdout із ширшим доступом, ніж
 * Sentry. Пишемо ту саму форму, що й `userIdHash` (`lib/userIdHash.ts`):
 * 16-hex префікс `sha256` — вистачає, щоб згрупувати запити з однієї адреси,
 * але не для re-identification без сирого IP. Сирий IP лишається тільки на
 * security-event-шляху, де він і потрібен для блок-рішень.
 */
function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * Проби платформи (Coolify, healthcheck образу) б'ють сюди кожні кілька
 * секунд. Рядка в access-log для них не пишемо, і в `http_requests_total` /
 * `http_errors_total` вони теж не йдуть: тисячі успішних проб розбавляли б
 * частку 5xx у burn-rate SLO. Але латентність проби — це рівно те, що міряє
 * SLO `/health` p95 (`job:health_p95_5m` → `BackendHealthP95High`), тож у
 * гістограму вони потрапляють. До 2026-10-08 ранній `return` пропускав і
 * гістограму, і алерт не мав даних саме від проб.
 */
const PROBE_PATHS = new Set(["/livez", "/readyz", "/health"]);

function observeProbeLatency(req: Request, res: Response, path: string): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    try {
      httpRequestDurationMs.observe(
        {
          method: req.method,
          path,
          status_class: statusClass(res.statusCode),
        },
        elapsedMs(start),
      );
    } catch {
      /* metrics must never break a request */
    }
  });
}

export function requestLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const url = req.originalUrl || "";
  // Не спамимо логи запитами на статику.
  if (url.startsWith("/assets/")) {
    next();
    return;
  }
  if (PROBE_PATHS.has(url)) {
    observeProbeLatency(req, res, url);
    next();
    return;
  }

  const start = process.hrtime.bigint();
  httpInFlight.inc({ method: req.method });

  res.on("finish", () => {
    httpInFlight.dec({ method: req.method });
    const ms = elapsedMs(start);
    const routePath = req.route?.path;
    const basePath = typeof req.baseUrl === "string" ? req.baseUrl : "";
    // Fallback на `unknown` (не сирий URL) щоб не роздувати cardinality Prometheus
    // сканерами /wp-admin і подібним.
    const path = routePath != null ? `${basePath}${routePath}` : "unknown";
    const status = res.statusCode;
    const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    const bytesOut = Number(res.getHeader("content-length")) || 0;
    const mod = als.getStore()?.module || "unknown";

    logger[level]({
      msg: "http",
      method: req.method,
      path,
      status,
      ms: Math.round(ms),
      bytesOut,
      ipHash: hashIp(req.ip),
      ua: req.get("user-agent") || undefined,
    });

    try {
      const sc = statusClass(status);
      httpRequestsTotal.inc({
        method: req.method,
        path,
        status,
        module: mod,
      });
      httpRequestDurationMs.observe(
        { method: req.method, path, status_class: sc },
        ms,
      );
      // Дедикований лічильник помилок: інкрементуємо ТІЛЬКИ для 4xx/5xx,
      // щоб PromQL для error-rate був `rate(http_errors_total[5m]) / rate(...count)`
      // без регекс-фільтра по `status`.
      if (status >= 400) {
        httpErrorsTotal.inc({
          method: req.method,
          path,
          status_class: sc,
          module: mod,
        });
      }
    } catch {
      /* metrics must never break a request */
    }
  });
  next();
}
