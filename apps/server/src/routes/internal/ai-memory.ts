/**
 * `/api/internal/ai-memory/*` — backfill orchestration endpoints для
 * `scripts/ai-memory-backfill.mjs` (PR-21 follow-up).
 *
 * Design:
 *   * Backfill — admin/operator workflow, не user-facing. Гейтиться
 *     `INTERNAL_API_KEY` bearer token (роздається у `routes/internal/
 *     index.ts`).
 *   * Chunked-API: CLI робить `POST /backfill/start` (returns stateId,
 *     totalCandidates, estimatedCostUsd), потім loop-ить
 *     `POST /backfill/batch` доки `hasMore=false`, фіналізує
 *     `POST /backfill/finalize`. Кожен виклик — 1 batch, server не
 *     блокується надовго.
 *   * Все стани зберігаються у `ai_memory_backfill_state` (migration 063),
 *     щоб довгий run-можна було pause-ити / resume-ити.
 *
 * Не повторюємо логіку у CLI — CLI лишається тонким, server тримає
 * `enqueueMemoryIngest`-callsite + Voyage budget guard + Sentry hooks.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import {
  finalizeBackfill,
  runBackfillBatch,
  startBackfill,
  type BackfillStatus,
} from "../../modules/ai-memory/backfill.js";

const StartBackfillBody = z
  .object({
    founderUserId: z.string().min(1).max(256),
    daysWindow: z.number().int().positive().max(365),
    sourceMode: z.enum(["cofounder", "all"]),
    batchSize: z.number().int().positive().max(1000),
    dryRun: z.boolean(),
    topicFilter: z.array(z.string().min(1).max(64)).max(32).optional(),
  })
  .strict();

const RunBatchBody = z
  .object({
    stateId: z.number().int().positive(),
    founderUserId: z.string().min(1).max(256),
  })
  .strict();

const FinalizeBody = z
  .object({
    stateId: z.number().int().positive(),
    founderUserId: z.string().min(1).max(256),
    status: z.enum([
      "completed",
      "aborted_budget",
      "aborted_error",
      "dry_run_completed",
    ] as const satisfies readonly BackfillStatus[]),
    error: z.string().max(2048).optional(),
  })
  .strict();

export function createAiMemoryInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  /**
   * POST /api/internal/ai-memory/backfill/start
   * Body: { founderUserId, daysWindow, sourceMode, batchSize, dryRun, topicFilter? }
   * Returns: { ok: true, stateId, totalCandidates, estimatedCostUsd,
   *            status, budgetExceeded, voyageBudgetSoftUsd }
   */
  r.post(
    "/api/internal/ai-memory/backfill/start",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(StartBackfillBody, req, res);
      if (!parsed.ok) return;
      const out = await startBackfill(pool, {
        founderUserId: parsed.data.founderUserId,
        daysWindow: parsed.data.daysWindow,
        sourceMode: parsed.data.sourceMode,
        batchSize: parsed.data.batchSize,
        dryRun: parsed.data.dryRun,
        ...(parsed.data.topicFilter !== undefined
          ? { topicFilter: parsed.data.topicFilter }
          : {}),
      });
      res.json({ ok: true, ...out });
    }),
  );

  /**
   * POST /api/internal/ai-memory/backfill/batch
   * Body: { stateId, founderUserId }
   * Returns: { ok: true, stateId, processedInBatch, enqueuedInBatch,
   *            skippedDedupInBatch, cumulativeProcessed, cumulativeEnqueued,
   *            hasMore, lastProcessedId }
   */
  r.post(
    "/api/internal/ai-memory/backfill/batch",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(RunBatchBody, req, res);
      if (!parsed.ok) return;
      const out = await runBackfillBatch(pool, {
        stateId: parsed.data.stateId,
        founderUserId: parsed.data.founderUserId,
      });
      res.json({ ok: true, ...out });
    }),
  );

  /**
   * POST /api/internal/ai-memory/backfill/finalize
   * Body: { stateId, founderUserId, status, error? }
   * Returns: { ok: true }
   */
  r.post(
    "/api/internal/ai-memory/backfill/finalize",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(FinalizeBody, req, res);
      if (!parsed.ok) return;
      await finalizeBackfill(pool, {
        stateId: parsed.data.stateId,
        founderUserId: parsed.data.founderUserId,
        status: parsed.data.status,
        ...(parsed.data.error !== undefined
          ? { error: parsed.data.error }
          : {}),
      });
      res.json({ ok: true });
    }),
  );

  return r;
}
