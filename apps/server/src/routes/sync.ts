import { Router } from "express";
import { rateLimitExpress, requireSession, setModule } from "../http/index.js";
import { listSyncAudit } from "../modules/sync/audit.js";
import { syncV2Pull, syncV2Push } from "../modules/sync/syncV2.js";
import { syncV2Stream } from "../modules/sync/syncV2Stream.js";

/**
 * `/api/sync/*` — read-only audit log лишається за авторизованою сесією.
 * `setModule` і `requireSession` унесені з handler-ів сюди: handler тепер
 * просто читає `req.user` і виконує бізнес-логіку.
 *
 * `/api/sync/audit` (PR #005) — read-only audit log. Self-режим або
 * admin-allowlist для чужих юзерів; ділить ту ж auth/rate-limit-обгортку
 * (модуль `sync`), але навмисно НЕ використовує канал push/pull —
 * incident-response не повинен ділити budget з нормальною sync-операцією.
 *
 * `/api/v2/sync/*` (Stage 2 / PR #021) — per-row op-log sync. Єдиний
 * sync-канал починаючи з 2026-05-06 (Initiative 0003 Phase 5, ADR-0047).
 * v1 push/pull endpoint-и та їх sunset/survey middleware остаточно
 * видалено (Initiative 0003 Phase 7) — старі клієнти тепер отримують
 * голий 404 замість 410 Gone, що прийнятно після 90-денного deprecation
 * window. Власний rate-limit-budget v2 (`api:v2:sync`, 60/min — щедріший,
 * бо op-log push може бути частим) і `module=syncV2` для логів/метрик.
 */
export function createSyncRouter(): Router {
  const r = Router();
  r.use("/api/sync", setModule("sync"));
  r.use(
    "/api/sync",
    rateLimitExpress({ key: "api:sync", limit: 30, windowMs: 60_000 }),
  );
  r.use("/api/sync", requireSession());
  r.get("/api/sync/audit", listSyncAudit);

  r.use("/api/v2/sync", setModule("syncV2"));
  r.use(
    "/api/v2/sync",
    rateLimitExpress({ key: "api:v2:sync", limit: 60, windowMs: 60_000 }),
  );
  r.use("/api/v2/sync", requireSession());
  r.post("/api/v2/sync/push", syncV2Push);
  r.get("/api/v2/sync/pull", syncV2Pull);
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
    syncV2Stream,
  );

  return r;
}
