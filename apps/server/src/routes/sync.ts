import { Router } from "express";
import {
  asyncHandler,
  rateLimitExpress,
  requireSession,
  setModule,
} from "../http/index.js";
import { listSyncAudit } from "../modules/sync/audit.js";
import { v1ClientSurveyMiddleware } from "../modules/sync/clientSurvey.js";
import { respondV1Gone } from "../modules/sync/sunsetGone.js";
import { v1SunsetHeadersMiddleware } from "../modules/sync/sunsetHeaders.js";
import { syncV2Pull, syncV2Push } from "../modules/sync/syncV2.js";
import { syncV2Stream } from "../modules/sync/syncV2Stream.js";

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
 * `/api/v2/sync/*` (Stage 2 / PR #021) — per-row op-log sync. Лишається
 * єдиним sync-каналом починаючи з 2026-05-06 (Initiative 0003 Phase 5,
 * ADR-0047). v1 push/pull endpoint-и повертають 410 Gone з
 * `successor: /api/v2/sync` payload-ом (див. `sunsetGone.ts`); решта
 * v1 inventory (`/api/sync/audit`) лишається — це read-only audit-log,
 * не sync-канал. Власний rate-limit-budget v2 (`api:v2:sync`, 60/min —
 * щедріший, бо op-log push може бути частим) і `module=syncV2` для
 * логів/метрик.
 *
 * v1 routes лишаються змонтованими (а не просто видаленими) щоб survey-
 * middleware і sunset-headers-middleware продовжили рахувати legacy-
 * traffic і повертати RFC 8594 / 8288 headers разом із 410 — це дозволяє
 * клієнтам перевести retry-decay logic у "stop calling permanently".
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
  // не емітиться, але Deprecation і Link залишаються. Залишений активним
  // після Phase 5 (T₀, ADR-0047) — клієнти, що ще б'ються у 410, читають
  // Sunset/Link headers разом із 410-body, щоб повністю припинити retry.
  r.use("/api/sync", v1SunsetHeadersMiddleware());
  // Initiative 0003 Phase 5 / ADR-0047 — T₀ executed. Усі v1 push/pull
  // endpoint-и повертають 410 Gone із successor pointer-ом (`/api/v2/sync`).
  // Handler-и `syncPush*`/`syncPull*` видалено разом із backing-таблицею
  // `module_data` (Stage 7 final, цей PR). Лишився тільки 410-stub з
  // sunset/deprecation headers.
  r.post("/api/sync/push", asyncHandler(respondV1Gone));
  r.post("/api/sync/pull", asyncHandler(respondV1Gone));
  r.get("/api/sync/pull-all", asyncHandler(respondV1Gone));
  r.post("/api/sync/pull-all", asyncHandler(respondV1Gone));
  r.post("/api/sync/push-all", asyncHandler(respondV1Gone));
  r.get("/api/sync/audit", asyncHandler(listSyncAudit));

  r.use("/api/v2/sync", setModule("syncV2"));
  r.use(
    "/api/v2/sync",
    rateLimitExpress({ key: "api:v2:sync", limit: 60, windowMs: 60_000 }),
  );
  r.use("/api/v2/sync", requireSession());
  r.post("/api/v2/sync/push", asyncHandler(syncV2Push));
  r.get("/api/v2/sync/pull", asyncHandler(syncV2Pull));
  // Stage 5 / PR #041: SSE long-polling. Окрема rate-limit-категорія,
  // бо connection-handshake — це 1 hit; ми не хочемо, щоб stream-
  // reconnect-loop при flapping-мережі з'їдав push-budget.
  r.get(
    "/api/v2/sync/stream",
    rateLimitExpress({
      key: "api:v2:sync:stream",
      limit: 30,
      windowMs: 60_000,
    }),
    asyncHandler(syncV2Stream),
  );

  return r;
}
