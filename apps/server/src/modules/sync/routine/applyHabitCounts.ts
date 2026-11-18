import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  applyIfNewer,
  assertRowUserId,
  queryOne,
  type ExistingUuidRow,
} from "../applySync-helpers.js";
import { parseOptionalDayKey } from "../../../lib/routineScheduleFields.js";

/**
 * Кроки лічильника звички за день (`routine_habit_counts`, міграція 170,
 * Р-1 (а)). Форма за зразком `applyRoutineHabitSkips`: PK `(user_id, id)`,
 * LWW по `updated_at`, upsert зі скиданням `deleted_at` (воскресіння
 * новішим записом, як у `guardUuidPkApply`), `delete` = soft-delete.
 *
 * `id` дублює пару `habit_id` + `date_key` (`habitId__dateKey`, той самий
 * формат, що `skip_key`). Розбіжність означала б два рядки на той самий
 * день звички з різними числами, тож відхиляємо її з причиною до запису.
 * `date_key` — день пристрою (ADR-0078), сервер його не перераховує.
 *
 * AI-NOTE: сервер не перевіряє, що лічильник узгоджений із відміткою дня
 * (`routine_entries`): відмітку ставить і знімає клієнтський домен
 * (`applyHabitCounterStep`), і два пристрої розсуджує LWW кожної таблиці.
 */
export async function applyRoutineHabitCounts(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM routine_habit_counts WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  if (existing) {
    if (existing.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  if (op.op === "delete") {
    if (!existing) return { status: "rejected", reason: "not_found" };
    return applyIfNewer(
      client,
      `UPDATE routine_habit_counts
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND id = $3 AND updated_at < $1`,
      [clientTs, userId, id],
    );
  }

  const habitId = typeof row["habit_id"] === "string" ? row["habit_id"] : "";
  const dateKey = parseOptionalDayKey(row["date_key"]);
  if (dateKey === null) {
    return { status: "rejected", reason: "missing_date_key" };
  }
  if (dateKey === "invalid" || !habitId || id !== `${habitId}__${dateKey}`) {
    return { status: "rejected", reason: "invalid_count_key" };
  }
  const count = row["count"];
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return { status: "rejected", reason: "invalid_count" };
  }

  return applyIfNewer(
    client,
    `INSERT INTO routine_habit_counts (id, user_id, habit_id, date_key, count, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     ON CONFLICT (user_id, id) DO UPDATE
       SET habit_id = EXCLUDED.habit_id, date_key = EXCLUDED.date_key,
           count = EXCLUDED.count, updated_at = EXCLUDED.updated_at,
           deleted_at = NULL
       WHERE routine_habit_counts.updated_at < EXCLUDED.updated_at`,
    [id, userId, habitId, dateKey, count, clientTs],
  );
}
