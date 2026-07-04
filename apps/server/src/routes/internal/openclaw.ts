/**
 * `/api/internal/openclaw/*` — internal HTTP API для OpenClaw bot
 * (tools/openclaw DM-handler).
 *
 * Архітектура (ADR-0031 §5):
 *   tools/openclaw (DM bot)     ──HTTP──▶  apps/server /api/internal/openclaw/*
 *                                          ├─ recall      (recall_memory)
 *                                          ├─ strategy    (read_strategy_docs)
 *                                          ├─ query       (query_app_db)
 *                                          ├─ github      (read_github)
 *                                          ├─ workflow    (read_workflow_logs)
 *                                          ├─ telegram    (read_telegram_topic_history)
 *                                          ├─ decision    (record_decision)
 *                                          ├─ budget      (checkDailyBudget pre-call)
 *                                          ├─ invocations/open
 *                                          └─ invocations/finalize
 *
 * Чому tool execution тут, а не у `tools/openclaw`:
 *   - Single-process pgvector / Postgres connection pool.
 *   - Allowlist-enforcement в одному місці (compromised console process
 *     не може bypass-ити).
 *   - Audit-log writes до БД ближче.
 *
 * Auth: bearer-token guard у `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 *
 * Handlers рознесені по суб-роутерах у `./openclaw/routes-*.ts`
 * (Hard Rule #18); схеми — `./openclaw/schemas.ts`, спільні error-mappers —
 * `./openclaw/helpers.ts`. Import-шлях `./openclaw.js` для
 * `createOpenClawInternalRouter` збережено.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { logger } from "../../obs/logger.js";
import type { OpenClawTrigger } from "../../modules/openclaw/types.js";
import { registerMemoryRoutes } from "./openclaw/routes-memory.js";
import { registerToolsRoutes } from "./openclaw/routes-tools.js";
import { registerObservabilityRoutes } from "./openclaw/routes-observability.js";
import { registerRitualsRoutes } from "./openclaw/routes-rituals.js";
import { registerWriteRoutes } from "./openclaw/routes-write.js";
import { registerAutomationRoutes } from "./openclaw/routes-automation.js";

// ─────────────────────────────────────────────────────────────────────────
// Router factory
// ─────────────────────────────────────────────────────────────────────────

export function createOpenClawInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  registerMemoryRoutes(r, pool);
  registerToolsRoutes(r, pool);
  registerObservabilityRoutes(r, pool);
  registerRitualsRoutes(r, pool);
  registerWriteRoutes(r, pool);
  registerAutomationRoutes(r, pool);

  // Logging trace для debug-у — щоб у логах було видно openclaw subroutes.
  // Не вище middleware щоб не дублювати лог-події з error-handler-а.
  r.use("/api/internal/openclaw", (req, _res, next) => {
    logger.debug({
      msg: "openclaw_internal_request",
      path: req.path,
      method: req.method,
    });
    next();
  });

  // Запобіжно: явний типаж для unused імпортів `OpenClawTrigger` (інакше
  // ts-unused-expressions фейлить). Експортуємо тип через index.ts.
  void ({} as OpenClawTrigger);

  return r;
}
