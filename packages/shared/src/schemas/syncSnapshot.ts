import { z } from "zod";

import { SYNC_V2_PULL_MAX_LIMIT } from "./api";

/**
 * `GET /api/v2/sync/snapshot` і відмова pull за простроченим курсором
 * (ADR-0105 §3, аудит 2026-10-01 `rel-06`).
 *
 * Snapshot віддає поточний стан рядків користувача з модульних sync-таблиць
 * у формі pull-оп-ів (`op: "insert"`, `row` у формі колонок таблиці,
 * tombstone-и з `deleted_at` включно), тож клієнт застосовує їх тим самим
 * `applyPullOp`. Сторінкування - тим самим байтовим бюджетом, що й pull
 * (`SYNC_V2_PULL_MAX_BYTES`), курсор непрозорий.
 */

/** Код помилки 410 на `GET /api/v2/sync/pull` із `since < floor_id`. */
export const SYNC_CURSOR_EXPIRED_CODE = "sync_cursor_expired";

/** Стеля довжини непрозорого курсора snapshot (base64url JSON). */
export const SYNC_V2_SNAPSHOT_CURSOR_MAX_LEN = 2048;

/**
 * Query snapshot. Перша сторінка - без параметрів (сервер фіксує
 * `as_of_op_id`); наступні - `cursor` з попередньої відповіді і той самий
 * `as_of_op_id`, який сервер повертає на кожній сторінці. `cursor` без
 * `as_of_op_id` - 400: інакше клієнт поставив би курсор pull на значення,
 * зняте не в тій транзакції, що перша сторінка.
 */
export const SyncV2SnapshotQuerySchema = z
  .object({
    cursor: z.string().min(1).max(SYNC_V2_SNAPSHOT_CURSOR_MAX_LEN).optional(),
    as_of_op_id: z.coerce.number().int().nonnegative().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(SYNC_V2_PULL_MAX_LIMIT)
      .optional()
      .default(SYNC_V2_PULL_MAX_LIMIT),
  })
  .refine((q) => q.cursor === undefined || q.as_of_op_id !== undefined, {
    message: "cursor потребує as_of_op_id з першої сторінки",
    path: ["as_of_op_id"],
  });
export type SyncV2SnapshotQuery = z.infer<typeof SyncV2SnapshotQuerySchema>;
