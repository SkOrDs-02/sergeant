/**
 * `/api/internal/debug-window/*` — internal HTTP API for the runtime debug-
 * window toggle (PR-35 follow-up).
 *
 * Delegates directly to `apps/server/src/obs/logger.ts` exports:
 *   • `enableDebugWindow`  — sets `debugUntilMs = Date.now() + durationMs`
 *   • `disableDebugWindow` — clears the window immediately
 *   • `debugWindowRemainingMs` — ms until auto-revert
 *   • `currentLogLevel`   — "debug" when window active, else base level
 *
 * Auth: bearer-token guard applied by the parent `/api/internal` router in
 * `routes/internal/index.ts` — no per-route guard needed here.
 *
 * Callers:
 *   • tools/openclaw `/debug-window` Telegram command (POST /enable)
 *   • tools/openclaw `/debug-window-status` Telegram command (GET /status)
 */

import { Router } from "express";
import { asyncHandler } from "../../http/index.js";
import {
  enableDebugWindow,
  disableDebugWindow,
  debugWindowRemainingMs,
  currentLogLevel,
} from "../../obs/logger.js";

const DEFAULT_DURATION_MS = 15 * 60_000; // 15 minutes

export function createDebugWindowInternalRouter(): Router {
  const router = Router();

  // POST /api/internal/debug-window/enable
  // Body: { durationMs?: number; requestedBy?: string }
  router.post(
    "/api/internal/debug-window/enable",
    asyncHandler(async (req, res) => {
      const body = req.body as {
        durationMs?: unknown;
        requestedBy?: unknown;
      };
      const durationMs =
        typeof body.durationMs === "number" && body.durationMs > 0
          ? body.durationMs
          : DEFAULT_DURATION_MS;
      const requestedBy =
        typeof body.requestedBy === "string" && body.requestedBy.length > 0
          ? body.requestedBy
          : "openclaw";

      enableDebugWindow(durationMs, requestedBy);
      res.json({ ok: true, remainingMs: debugWindowRemainingMs() });
    }),
  );

  // POST /api/internal/debug-window/disable
  router.post(
    "/api/internal/debug-window/disable",
    asyncHandler(async (_req, res) => {
      disableDebugWindow();
      res.json({ ok: true });
    }),
  );

  // GET /api/internal/debug-window/status
  router.get(
    "/api/internal/debug-window/status",
    asyncHandler(async (_req, res) => {
      res.json({ level: currentLogLevel(), remainingMs: debugWindowRemainingMs() });
    }),
  );

  return router;
}
