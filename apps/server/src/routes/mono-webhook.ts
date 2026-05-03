import { Router } from "express";
import { asyncHandler, requireSession, setModule } from "../http/index.js";
import {
  connectHandler,
  disconnectHandler,
  syncStateHandler,
} from "../modules/mono/connection.js";
import { accountsHandler, transactionsHandler } from "../modules/mono/read.js";
import {
  backfillHandler,
  backfillProgressHandler,
} from "../modules/mono/backfill.js";
import { webhookHandler } from "../modules/mono/webhook.js";

/**
 * Роутер для webhook-based Monobank інтеграції (Track A).
 *
 * Webhook endpoint (`POST /api/mono/webhook/:secret`) монтується БЕЗ session
 * auth — це публічний endpoint, куди Monobank надсилає delivery. Авторизація
 * через path-secret (constant-time compare у handler-і).
 *
 * Решта endpoints — під `requireSession()`.
 */
export function createMonoWebhookRouter(): Router {
  const r = Router();

  r.use("/api/mono/connect", setModule("finyk"));
  r.use("/api/mono/disconnect", setModule("finyk"));
  r.use("/api/mono/sync-state", setModule("finyk"));
  r.use("/api/mono/accounts", setModule("finyk"));
  r.use("/api/mono/transactions", setModule("finyk"));
  r.use("/api/mono/backfill", setModule("finyk"));
  r.use("/api/mono/backfill-progress", setModule("finyk"));

  // Webhook — публічний, без auth
  r.post("/api/mono/webhook/:secret", asyncHandler(webhookHandler));

  // Session-protected endpoints
  r.post("/api/mono/connect", requireSession(), asyncHandler(connectHandler));
  r.post(
    "/api/mono/disconnect",
    requireSession(),
    asyncHandler(disconnectHandler),
  );
  r.get(
    "/api/mono/sync-state",
    requireSession(),
    asyncHandler(syncStateHandler),
  );
  r.get("/api/mono/accounts", requireSession(), asyncHandler(accountsHandler));
  r.get(
    "/api/mono/transactions",
    requireSession(),
    asyncHandler(transactionsHandler),
  );
  r.post("/api/mono/backfill", requireSession(), asyncHandler(backfillHandler));
  r.get(
    "/api/mono/backfill-progress",
    requireSession(),
    asyncHandler(backfillProgressHandler),
  );

  return r;
}
