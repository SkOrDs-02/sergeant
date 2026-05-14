/**
 * `/api/internal/ai-memory-dlq/*` — DLQ replay endpoints.
 *
 * Architecture:
 *
 *   operator/CLI
 *     POST /api/internal/ai-memory-dlq/list   (filter+paginate active rows)
 *     POST /api/internal/ai-memory-dlq/replay (re-enqueue selected rows)
 *
 *   Replay flow:
 *     1. SELECT … FROM ai_memory_ingest_failed WHERE replayed_at IS NULL …
 *     2. For each row → enqueueMemoryIngest(payload_json) — повторно проходить
 *        gating (per-source kill-switch, soft/hard Voyage budget).
 *     3. UPDATE replayed_at = NOW(), replay_count++.
 *
 * Safety:
 *   * `dryRun: true` за замовчуванням — operator має явно передати
 *     `dryRun: false` (або CLI `--execute`).
 *   * Bearer-token guard у `routes/internal/index.ts`.
 *   * Per-call cap `limit ≤ 1000` — не дозволяємо massive single-batch replay
 *     (Voyage rate-limit + budget burn).
 *
 * Mutually exclusive filters:
 *   * `eventIds: number[]` — точкова вибірка (точно ті rows).
 *   * `source: string` + `since: ISO datetime` — query-mode.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";

import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import {
  listDlqRows,
  markDlqRowReplayed,
  type DlqRow,
} from "../../modules/ai-memory/dlq.js";
import { enqueueMemoryIngest } from "../../modules/ai-memory/ingestQueue.js";
import { logger, serializeError } from "../../obs/logger.js";

const ReplayBody = z
  .object({
    eventIds: z.array(z.number().int().positive()).optional(),
    source: z.string().min(1).max(64).optional(),
    since: z.string().datetime().optional(),
    limit: z.number().int().positive().max(1000).optional(),
    dryRun: z.boolean().optional().default(true),
  })
  .strict()
  .refine(
    (val) =>
      (val.eventIds && val.eventIds.length > 0) ||
      val.source !== undefined ||
      val.since !== undefined,
    {
      message: "Provide one of: eventIds[], source, since.",
    },
  );

const ListBody = z
  .object({
    source: z.string().min(1).max(64).optional(),
    since: z.string().datetime().optional(),
    limit: z.number().int().positive().max(1000).optional(),
    includeReplayed: z.boolean().optional().default(false),
  })
  .strict();

function serializeDlqRow(row: DlqRow): {
  id: number;
  userId: string;
  source: string;
  sourceRef: string | null;
  errorMsg: string;
  attempts: number;
  lastAttemptAt: string;
  replayedAt: string | null;
  replayCount: number;
} {
  return {
    id: row.id,
    userId: row.userId,
    source: row.source,
    sourceRef: row.sourceRef,
    errorMsg: row.errorMsg,
    attempts: row.attempts,
    lastAttemptAt: row.lastAttemptAt.toISOString(),
    replayedAt: row.replayedAt ? row.replayedAt.toISOString() : null,
    replayCount: row.replayCount,
  };
}

// Pool є у `createInternalRouter` лише для DI parity з іншими routes; DLQ
// модуль використовує shared `query()` із `db.ts`, тож pool тут — placeholder.
export function createAiMemoryDlqInternalRouter(_: { pool: Pool }): Router {
  const r = Router();

  /**
   * POST /api/internal/ai-memory-dlq/list
   * Body: { source?, since?, limit?, includeReplayed? }
   * Returns: { ok, rows: DlqRowSerialized[] }
   */
  r.post(
    "/api/internal/ai-memory-dlq/list",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ListBody, req, res);
      if (!parsed.ok) return;

      const rows = await listDlqRows({
        ...(parsed.data.source !== undefined
          ? { source: parsed.data.source }
          : {}),
        ...(parsed.data.since !== undefined
          ? { since: new Date(parsed.data.since) }
          : {}),
        limit: parsed.data.limit ?? 100,
        includeReplayed: parsed.data.includeReplayed,
      });

      res.json({
        ok: true,
        rows: rows.map(serializeDlqRow),
      });
    }),
  );

  /**
   * POST /api/internal/ai-memory-dlq/replay
   * Body: { eventIds? | source? + since?, limit?, dryRun? }
   * Returns: { ok, dryRun, attempted, replayed, skipped, errors[] }
   */
  r.post(
    "/api/internal/ai-memory-dlq/replay",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ReplayBody, req, res);
      if (!parsed.ok) return;

      const data = parsed.data;
      const dryRun = data.dryRun;

      const rows = await listDlqRows({
        ...(data.eventIds && data.eventIds.length > 0
          ? { ids: data.eventIds }
          : {}),
        ...(data.source !== undefined ? { source: data.source } : {}),
        ...(data.since !== undefined ? { since: new Date(data.since) } : {}),
        limit: data.limit ?? 100,
        includeReplayed: false,
      });

      if (dryRun) {
        res.json({
          ok: true,
          dryRun: true,
          attempted: rows.length,
          replayed: 0,
          skipped: 0,
          rows: rows.map(serializeDlqRow),
          errors: [],
        });
        return;
      }

      let replayed = 0;
      const errors: { id: number; error: string }[] = [];
      for (const row of rows) {
        try {
          await enqueueMemoryIngest({
            userId: row.payloadJson.userId,
            source: row.payloadJson.source,
            sourceRef: row.payloadJson.sourceRef,
            content: row.payloadJson.content,
            ...(row.payloadJson.metadata !== undefined
              ? { metadata: row.payloadJson.metadata }
              : {}),
          });
          await markDlqRowReplayed(row.id);
          replayed++;
        } catch (err) {
          // enqueueMemoryIngest не throw-ить (внутрішньо ловить), але про
          // markDlqRowReplayed-fail хочемо знати на per-row рівні.
          logger.warn({
            msg: "ai_memory_dlq_replay_row_failed",
            id: row.id,
            source: row.source,
            err: serializeError(err, { includeStack: false }),
          });
          errors.push({
            id: row.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      res.json({
        ok: errors.length === 0,
        dryRun: false,
        attempted: rows.length,
        replayed,
        skipped: rows.length - replayed - errors.length,
        errors,
      });
    }),
  );

  return r;
}
