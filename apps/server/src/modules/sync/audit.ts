import type { Request, Response } from "express";
import { z } from "zod";
import pool from "../../db.js";
import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";

/**
 * Admin-аудит-endpoint для `sync_audit_log` (Stage 0 / PR #005 з
 * `docs/planning/storage-roadmap.md`).
 *
 * Два режими, обидва на одному URL:
 *
 *   * Self: `GET /api/sync/audit` без `user_id`-парам або з
 *     `user_id === req.user.id`. Дозволено будь-якому залогіненому
 *     юзеру: персональний "коли мене останній раз pulled, чи був
 *     conflict".
 *   * Admin: `GET /api/sync/audit?user_id=<X>` для чужого X.
 *     Дозволено лише, якщо `req.user.id` у `env.SYNC_AUDIT_ADMIN_USER_IDS`.
 *     Інакше 403, без подробиць (щоб не leak-ати, що такий user_id
 *     взагалі існує).
 *
 * Pagination — cursor-based по `id` (не OFFSET, бо аудит приростає
 * швидко і OFFSET-сторінки дрейфуватимуть). Клієнт надсилає
 * `before_id` від останнього рядка попередньої сторінки.
 */

type WithSessionUser = Request & { user?: { id: string } };

const AUDIT_LIMIT_DEFAULT = 50;
const AUDIT_LIMIT_MAX = 200;

const AuditQuerySchema = z.object({
  user_id: z.string().min(1).max(64).optional(),
  /**
   * Cursor: повертати лише записи з id < before_id. Стрінг, бо HTTP
   * query завжди стрінги. Парсимо як число тут.
   */
  before_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(AUDIT_LIMIT_MAX)
    .optional()
    .default(AUDIT_LIMIT_DEFAULT),
  /**
   * Опціональний фільтр по op_type для дашбордів типу "лише
   * push-конфлікти". `unknown` теж легальний, бо саме під цим тегом
   * лежать invalid-rejects.
   */
  op_type: z.enum(["push", "pull", "push_all", "pull_all"]).optional(),
  /** Filter by outcome — корисно для адмін-погляду на conflict-и. */
  outcome: z
    .enum([
      "ok",
      "empty",
      "conflict",
      "invalid",
      "too_large",
      "unauthorized",
      "error",
    ])
    .optional(),
  /** Filter by module: 'finyk' / 'fizruk' / ... / 'all' / 'unknown'. */
  module: z.string().min(1).max(32).optional(),
});

interface AuditLogRow {
  id: string;
  user_id: string;
  op_type: string;
  module: string;
  outcome: string;
  conflict: boolean;
  payload_size_bytes: number | null;
  duration_ms: number | null;
  created_at: Date;
}

/**
 * Розбирає `env.SYNC_AUDIT_ADMIN_USER_IDS` (CSV) у Set. Викликаємо
 * на кожен запит — env-vars немутабельні в нашому процесі, але
 * пере-парс на цьому навантаженні (одна .split() per request) на
 * шапці запиту до Postgres-у в шумі. Як підвищиться навантаження —
 * рефактор у module-level `const`.
 */
function getAdminUserIds(): Set<string> {
  const raw = env.SYNC_AUDIT_ADMIN_USER_IDS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isSyncAuditAdmin(userId: string): boolean {
  return getAdminUserIds().has(userId);
}

/**
 * `GET /api/sync/audit` — list audit-рядків. RLS-логіка:
 *
 *   * За замовчуванням — лише власні: `WHERE user_id = req.user.id`.
 *   * Admin може запитати чужі через `?user_id=<X>`. У цьому випадку
 *     валідуємо, що `req.user.id` у allow-list-і; інакше 403.
 *
 * Запит йде по індексу `sync_audit_log_user_created_idx`. План:
 *   Index Scan using sync_audit_log_user_created_idx
 *     Index Cond: (user_id = $1) AND (created_at < ...)
 *   LIMIT N
 */
export async function listSyncAudit(
  req: Request,
  res: Response,
): Promise<void> {
  const user = (req as WithSessionUser).user!;

  const parsed = AuditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }
  const { user_id, before_id, limit, op_type, outcome, module } = parsed.data;

  // RLS: визнач, кого ми насправді читаємо. user_id===req.user.id або
  // не передано — self-режим. Інакше — admin-only.
  let targetUserId: string;
  if (!user_id || user_id === user.id) {
    targetUserId = user.id;
  } else {
    if (!isSyncAuditAdmin(user.id)) {
      // 403 без подробиць — не leak-аємо існування user_id.
      logger.warn({
        msg: "sync_audit_forbidden",
        actorId: user.id,
        requestedUserId: user_id,
      });
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    targetUserId = user_id;
  }

  // Динамічний WHERE зібраний руками, бо у нас опціональні фільтри
  // різного типу і `pg` не підтримує іменовані параметри. Параметри
  // йдуть позиційно, тому збираємо у масив.
  const params: unknown[] = [targetUserId];
  let where = `user_id = $1`;
  let idx = 2;
  if (before_id != null) {
    where += ` AND id < $${idx++}`;
    params.push(before_id);
  }
  if (op_type) {
    where += ` AND op_type = $${idx++}`;
    params.push(op_type);
  }
  if (outcome) {
    where += ` AND outcome = $${idx++}`;
    params.push(outcome);
  }
  if (module) {
    where += ` AND module = $${idx++}`;
    params.push(module);
  }
  params.push(limit);

  const result = await pool.query<AuditLogRow>(
    `SELECT id, user_id, op_type, module, outcome, conflict,
            payload_size_bytes, duration_ms, created_at
     FROM sync_audit_log
     WHERE ${where}
     ORDER BY id DESC
     LIMIT $${idx}`,
    params,
  );

  // Hard Rule #1: BIGSERIAL `id` повертається з `pg` як string. Coerce
  // до number, бо JSON-споживачі очікують number, і JS число тримає
  // 2^53 — для 50/sec-навантаження це 5 мільярдів років роботи.
  const rows = result.rows.map((r) => ({
    id: Number(r.id),
    userId: r.user_id,
    opType: r.op_type,
    module: r.module,
    outcome: r.outcome,
    conflict: r.conflict,
    payloadSizeBytes: r.payload_size_bytes,
    durationMs: r.duration_ms,
    createdAt: r.created_at,
  }));

  res.json({
    ok: true,
    userId: targetUserId,
    isAdminView: targetUserId !== user.id,
    rows,
    nextBeforeId: rows.length === limit ? rows[rows.length - 1].id : null,
  });
}
