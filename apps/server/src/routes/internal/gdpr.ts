/**
 * `/api/internal/gdpr/*` — internal HTTP endpoint for the `gdpr_cleanup_queue`
 * batch worker (ADR-0016 § ADR-6.3). Mirrors `/api/internal/mono/webhook/
 * rotate` (`routes/internal/mono.ts`): a Railway/n8n cron POSTs here on a
 * fixed cadence, there is no in-process scheduler.
 *
 * Auth: bearer-token guard in `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 * Caller is a cron — never an end-user.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { parseBody } from "../../http/validate.js";
import { logger } from "../../obs/logger.js";
import { processGdprCleanupQueueBatch } from "../../modules/gdpr/cleanupWorker.js";

const ProcessBody = z
  .object({
    /** Cap rows processed per call — protects rate limits + DB load. */
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export function createGdprInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.post("/api/internal/gdpr/cleanup-queue/process", async (req, res) => {
    const parsed = parseBody(ProcessBody, req);
    try {
      const result = await processGdprCleanupQueueBatch(pool, {
        limit: parsed.limit,
      });
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      logger.error({
        msg: "gdpr_cleanup_queue_endpoint_error",
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  return r;
}
