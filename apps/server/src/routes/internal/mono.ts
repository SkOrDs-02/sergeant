/**
 * `/api/internal/mono/*` — internal HTTP endpoints for the Monobank webhook
 * lifecycle. Currently exposes the periodic secret-rotation worker.
 *
 * Auth: bearer-token guard in `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 * Caller is a Railway/n8n cron — never an end-user.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { rotateStaleMonoWebhookSecrets } from "../../modules/mono/rotateSecret.js";
import { query as dbQuery } from "../../db.js";

const RotateBody = z
  .object({
    /**
     * Rotate connections older than this many days. Default 90 — chosen so
     * the rotation cadence is faster than a typical credential-leak
     * incident-response window (Monobank itself never expires the secret).
     */
    olderThanDays: z.number().int().min(1).max(365).optional(),
    /**
     * Stale-but-not-rotated threshold for Sentry alerting. Must be `>=`
     * `olderThanDays`; default 100 leaves a 10-day on-call window before
     * the secret is genuinely overdue.
     */
    alertAfterDays: z.number().int().min(1).max(730).optional(),
    /** Cap rotations per call — protects rate limits + DB load. Default 50. */
    limit: z.number().int().min(1).max(500).optional(),
    /** Don't actually rotate — just count candidates and report stale. */
    dryRun: z.boolean().optional(),
  })
  .strict();

export function createMonoInternalRouter(_args: { pool: Pool }): Router {
  const r = Router();

  r.post(
    "/api/internal/mono/webhook/rotate",
    asyncHandler(async (req, res) => {
      // 503 if the feature is off — nothing to rotate, and asserting here
      // catches misconfigured staging where the cron is wired but the
      // integration itself is disabled.
      if (!env.MONO_WEBHOOK_ENABLED) {
        res
          .status(503)
          .json({ error: "Monobank webhook integration is disabled" });
        return;
      }
      if (!env.MONO_TOKEN_ENC_KEY || !env.PUBLIC_API_BASE_URL) {
        // `assertStartupEnv` already enforces both when MONO_WEBHOOK_ENABLED
        // is true, so reaching here means a runtime misconfiguration.
        // Fail closed rather than crash with an undefined deref deeper in.
        res.status(503).json({
          error: "Mono webhook rotation is not configured",
          code: "NOT_CONFIGURED",
        });
        return;
      }

      const parsed = validateBody(RotateBody, req, res);
      if (!parsed.ok) return;

      try {
        const result = await rotateStaleMonoWebhookSecrets({
          encKey: env.MONO_TOKEN_ENC_KEY,
          publicApiBaseUrl: env.PUBLIC_API_BASE_URL,
          olderThanDays: parsed.data.olderThanDays,
          alertAfterDays: parsed.data.alertAfterDays,
          limit: parsed.data.limit,
          dryRun: parsed.data.dryRun,
          query: dbQuery,
        });
        res.status(200).json({
          ok: true,
          candidates: result.candidates,
          rotated: result.rotated,
          failed: result.failed,
          stale: result.stale,
          dryRun: result.dryRun,
        });
      } catch (err) {
        logger.error({
          msg: "mono_rotate_endpoint_error",
          err: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }),
  );

  return r;
}
