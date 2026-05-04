import { Router } from "express";
import {
  asyncHandler,
  rateLimitExpress,
  requireSession,
  setModule,
} from "../http/index.js";
import { listSyncAudit } from "../modules/sync/audit.js";
import { v1ClientSurveyMiddleware } from "../modules/sync/clientSurvey.js";
import {
  syncPull,
  syncPullAll,
  syncPush,
  syncPushAll,
} from "../modules/sync/sync.js";
import { v1SunsetHeadersMiddleware } from "../modules/sync/sunsetHeaders.js";
import { syncV2Pull, syncV2Push } from "../modules/sync/syncV2.js";

/**
 * `/api/sync/*` — всі операції потребують авторизованої сесії. `setModule` і
 * `requireSession` унесені з handler-ів сюди: handler тепер просто читає
 * `req.user` і виконує бізнес-логіку.
 *
 * `/api/sync/audit` (PR #005) — read-only audit log. Self-режим або
 * admin-allowlist для чужих юзерів; ділить ту ж auth/rate-limit-обгортку
 * (модуль `sync`), але навмисно НЕ використовує канал push/pull —
 * incident-response не повинен ділити budget з нормальною sync-операцією.
 *
 * `/api/v2/sync/*` (Stage 2 / PR #021) — per-row op-log sync. Живе
 * паралельно з v1 (`module_data`-based) до Stage 7 cleanup PR #052.
 * Власний rate-limit-budget (`api:v2:sync`, 60/min — щедріший за v1
 * push/pull, бо op-log push може бути частим), власний `module=syncV2`
 * для логів/метрик.
 */
export function createSyncRouter(): Router {
  const r = Router();
  r.use("/api/sync", setModule("sync"));
  r.use(
    "/api/sync",
    rateLimitExpress({ key: "api:sync", limit: 30, windowMs: 60_000 }),
  );
  r.use("/api/sync", requireSession());
  // v1 sunset survey: emit `sync_v1_legacy_clients_total` per push/pull.
  // Initiative 0003 Phase 1 — див. `clientSurvey.ts`.
  r.use("/api/sync", v1ClientSurveyMiddleware());
  // RFC 8594 / 8288 deprecation headers на всіх v1-routes (Initiative 0003
  // Phase 2 → ADR-0043). НЕ блокує запит — оголошує намір. T₀ через
  // `CLOUDSYNC_V1_SUNSET_AT` env var (ISO 8601). Без env — Sunset header
  // не емітиться, але Deprecation і Link залишаються.
  r.use("/api/sync", v1SunsetHeadersMiddleware());
  r.post("/api/sync/push", asyncHandler(syncPush));
  r.post("/api/sync/pull", asyncHandler(syncPull));
  r.get("/api/sync/pull-all", asyncHandler(syncPullAll));
  r.post("/api/sync/pull-all", asyncHandler(syncPullAll));
  r.post("/api/sync/push-all", asyncHandler(syncPushAll));
  r.get("/api/sync/audit", asyncHandler(listSyncAudit));

  r.use("/api/v2/sync", setModule("syncV2"));
  r.use(
    "/api/v2/sync",
    rateLimitExpress({ key: "api:v2:sync", limit: 60, windowMs: 60_000 }),
  );
  r.use("/api/v2/sync", requireSession());
  r.post("/api/v2/sync/push", asyncHandler(syncV2Push));
  r.get("/api/v2/sync/pull", asyncHandler(syncV2Pull));

  return r;
}
