/**
 * `/api/internal/silpo/*` — machine-to-machine ендпоїнти інтеграції Сільпо.
 * Наразі один: періодичний фоновий синк чеків для всіх підключених.
 *
 * Auth: bearer-гард у `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 * Викликач — n8n-крон (`ops/n8n-workflows/11-silpo-receipts-sync.json`),
 * ніколи не кінцевий користувач.
 */

import { Router } from "express";
import { z } from "zod";
import { parseBody } from "../../http/validate.js";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";
import { syncAllConnectedUsers } from "../../modules/silpo/syncAll.js";

const SyncAllBody = z
  .object({
    /** Стеля акаунтів за прогін. Дефолт 100 — див. `syncAll.ts`. */
    limit: z.number().int().min(1).max(500).optional(),
    /** Пауза між акаунтами, мс. Дефолт 250 — спільний `client_id`. */
    delayMs: z.number().int().min(0).max(5_000).optional(),
  })
  .strict();

export function createSilpoInternalRouter(): Router {
  const r = Router();

  r.post("/api/internal/silpo/sync-all", async (req, res) => {
    // 503 при вимкненій інтеграції: ловить середовище, де крон уже
    // підключений, а сама фіча ще ні (дзеркалить `internal/mono.ts`).
    if (!env.SILPO_ENABLED) {
      res.status(503).json({
        error: "Silpo integration is disabled",
        code: "SILPO_DISABLED",
      });
      return;
    }

    const parsed = parseBody(SyncAllBody, req);

    try {
      const result = await syncAllConnectedUsers({
        limit: parsed.limit,
        delayMs: parsed.delayMs,
      });
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      logger.error({
        msg: "silpo_sync_all_endpoint_error",
        err: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });

  return r;
}
