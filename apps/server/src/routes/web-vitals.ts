import { Router } from "express";
import { asyncHandler, rateLimitExpress } from "../http/index.js";
import webVitalsHandler from "../modules/observability/web-vitals.js";

export function createWebVitalsRouter(): Router {
  const r = Router();
  r.post(
    "/api/metrics/web-vitals",
    // M12 — per-IP rate-limit: 50 r/min. До зниження було 60; новий поріг
    // узгоджено з картою (`docs/security/hardening/M12-web-vitals-hardening.md`).
    // 50 = ~1 batch/sec — реальний клієнт відсилає batch на pagehide /
    // visibilitychange=hidden раз на сесію, тож 50/min дає запас на
    // швидке табування (Tab → Tab → ...) без false-positive-блокування
    // легітимного юзера.
    rateLimitExpress({ key: "api:web-vitals", limit: 50, windowMs: 60_000 }),
    asyncHandler(webVitalsHandler),
  );
  return r;
}
