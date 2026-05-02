import type { Request, Response } from "express";
import { WebVitalsPayloadSchema } from "@sergeant/shared";
import { logger } from "../../obs/logger.js";
import { webVitalsCls, webVitalsDurationMs } from "../../obs/metrics.js";

/**
 * POST /api/metrics/web-vitals
 *
 * Приймає батч Core Web Vitals від браузера — клієнт шле через
 * `navigator.sendBeacon` на `pagehide/visibilitychange=hidden`.
 *
 * Endpoint навмисно анонімний (web-vitals важливо міряти в тому числі на
 * неавторизованих відвідувачах) і rate-limited на рівні роутера — див.
 * `rateLimitExpress({ key: "api:web-vitals", ... })` у server/app.js.
 *
 * Завжди відповідає `204 No Content` — навіть на поганий payload. sendBeacon
 * ігнорує відповідь, а тіло з помилками не сенс повертати: клієнта немає кому
 * читати, плюс не хочемо давати зонду детальний feedback на malformed пейлоад.
 *
 * Валідно відхилені записи логуються один раз із `sample=1%` щоб не засмічувати
 * Pino потоком з публічного endpoint.
 */

const TIMING_METRICS = new Set<"LCP" | "INP" | "FCP" | "TTFB">([
  "LCP",
  "INP",
  "FCP",
  "TTFB",
]);

// Schema SSOT у `@sergeant/shared/schemas/api.ts#WebVitalsPayloadSchema`.
// Upper-bound для CLS (<=10) і для таймінгів (<=120_000 мс) живуть там.

export default function webVitalsHandler(req: Request, res: Response): void {
  // sendBeacon з `type: "application/json"` приходить як Buffer/string залежно
  // від middleware-а — Express `express.json()` уже парсить у req.body, але
  // якщо клієнт помилиться з content-type, body може бути undefined.
  const parsed = WebVitalsPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    if (Math.random() < 0.01) {
      logger.warn({
        msg: "web_vitals_invalid_payload",
        issues: parsed.error.issues?.slice(0, 3),
      });
    }
    res.status(204).end();
    return;
  }

  for (const m of parsed.data.metrics) {
    try {
      if (m.name === "CLS") {
        webVitalsCls.observe({ rating: m.rating }, m.value);
      } else if (TIMING_METRICS.has(m.name as "LCP" | "INP" | "FCP" | "TTFB")) {
        webVitalsDurationMs.observe(
          { metric: m.name, rating: m.rating },
          m.value,
        );
      }
    } catch {
      /* metrics must never break the handler */
    }
  }

  res.status(204).end();
}
