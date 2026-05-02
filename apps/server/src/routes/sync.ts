import { Router } from "express";
import {
  asyncHandler,
  rateLimitExpress,
  requireSession,
  setModule,
} from "../http/index.js";
import { listSyncAudit } from "../modules/sync/audit.js";
import {
  syncPull,
  syncPullAll,
  syncPush,
  syncPushAll,
} from "../modules/sync/sync.js";

/**
 * `/api/sync/*` — всі операції потребують авторизованої сесії. `setModule` і
 * `requireSession` унесені з handler-ів сюди: handler тепер просто читає
 * `req.user` і виконує бізнес-логіку.
 *
 * `/api/sync/audit` (PR #005) — read-only audit log. Self-режим або
 * admin-allowlist для чужих юзерів; ділить ту ж auth/rate-limit-обгортку
 * (модуль `sync`), але навмисно НЕ використовує канал push/pull —
 * incident-response не повинен ділити budget з нормальною sync-операцією.
 */
export function createSyncRouter(): Router {
  const r = Router();
  r.use("/api/sync", setModule("sync"));
  r.use(
    "/api/sync",
    rateLimitExpress({ key: "api:sync", limit: 30, windowMs: 60_000 }),
  );
  r.use("/api/sync", requireSession());
  r.post("/api/sync/push", asyncHandler(syncPush));
  r.post("/api/sync/pull", asyncHandler(syncPull));
  r.get("/api/sync/pull-all", asyncHandler(syncPullAll));
  r.post("/api/sync/pull-all", asyncHandler(syncPullAll));
  r.post("/api/sync/push-all", asyncHandler(syncPushAll));
  r.get("/api/sync/audit", asyncHandler(listSyncAudit));
  return r;
}
