import { Router } from "express";
import {
  rateLimitExpress,
  requireFreshSession,
  requireSession,
  setModule,
} from "../http/index.js";
import privatHandler from "../modules/mono/privat.js";
import {
  privatConnectHandler,
  privatDisconnectHandler,
  privatStatusHandler,
} from "../modules/mono/privatConnection.js";

/**
 * Bank-proxy endpoints. Currently only Privatbank — Monobank moved off the
 * client-side proxy to the server-side webhook flow (see
 * `apps/server/src/modules/mono/webhook.ts` + `connect.ts`). The legacy
 * `/api/mono` proxy and its `monoHandler` were removed in roadmap A;
 * `bankProxyFetch()` is still used by `backfill.ts` and Privatbank.
 *
 * `requireSession` тепер накриває ВЕСЬ `/api/privat` (спека
 * `docs/90-work/planning/specs/beta-security-readiness.md`, F1/F3). Раніше
 * проксі був навмисно анонімним, бо upstream-credentials приходили в
 * заголовках і сесія для них була не потрібна. Наслідків було два: клієнт
 * мусив тримати merchant-токен у `localStorage`, а сторонні могли ганяти
 * власні креденшели через нашу інфраструктуру. Тепер креденшели живуть
 * зашифровані в `privat_connection` і резолвляться за сесією.
 *
 * `connect` / `disconnect` стоять під `requireFreshSession()` — сесія
 * перевіряється в БД в обхід 5-хвилинного cookie-кешу, бо це операції над
 * привʼязкою банку (аудит 2026-08-05 § 7а). Тому `requireSession()` тут не
 * blanket-`use` на весь префікс, а явно на кожному роуті, який лишається
 * на кешованому варіанті — інакше connect резолвив би сесію двічі.
 */
export function createBanksRouter(): Router {
  const r = Router();
  r.use("/api/privat", setModule("finyk"));

  // Реєструємо connect/disconnect/status ДО catch-all `/api/privat`:
  // проксі-роут мапиться на точний шлях, але тримати порядок явним дешевше,
  // ніж покладатися на нього.
  r.post(
    "/api/privat/connect",
    requireFreshSession(),
    rateLimitExpress({
      key: "api:privat:connect",
      limit: 10,
      windowMs: 60_000,
    }),
    privatConnectHandler,
  );
  r.post(
    "/api/privat/disconnect",
    requireFreshSession(),
    privatDisconnectHandler,
  );
  r.get("/api/privat/status", requireSession(), privatStatusHandler);

  r.all(
    "/api/privat",
    requireSession(),
    rateLimitExpress({ key: "api:privat", limit: 30, windowMs: 60_000 }),
    privatHandler,
  );
  return r;
}
