import { Router } from "express";
import { asyncHandler, rateLimitExpress, setModule } from "../http/index.js";
import privatHandler from "../modules/mono/privat.js";

/**
 * Bank-proxy endpoints. Currently only Privatbank — Monobank moved off the
 * client-side proxy to the server-side webhook flow (see
 * `apps/server/src/modules/mono/webhook.ts` + `connect.ts`). The legacy
 * `/api/mono` proxy and its `monoHandler` were removed in roadmap A;
 * `bankProxyFetch()` is still used by `backfill.ts` and Privatbank.
 *
 * Token-перевірка (`x-privat-id`+`x-privat-token`) зроблена всередині
 * handler-а: це не сесійна auth, а upstream API-credentials, які і так
 * треба прочитати з заголовка, щоб передати далі в `fetch(...)`. Тому
 * middleware тут тільки тегує домен і rate-limit-ить.
 */
export function createBanksRouter(): Router {
  const r = Router();
  r.use("/api/privat", setModule("finyk"));
  r.all(
    "/api/privat",
    rateLimitExpress({ key: "api:privat", limit: 30, windowMs: 60_000 }),
    asyncHandler(privatHandler),
  );
  return r;
}
