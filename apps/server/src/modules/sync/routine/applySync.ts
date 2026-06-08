import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import {
  INCREMENT_DELTA_MAX_ABS,
  parseOptionalDate,
  toNonNegativeInt,
} from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";

/**
 * Apply-шлях для `routine_entries`. Кожна операція — повний UPSERT за
 * `id` (UUID PK). LWW-guard: existing.updated_at < clientTs. Власник
 * рядка перевіряється явно SELECT-ом до DML-у — якщо PK уже існує і
 * належить іншому юзеру, повертаємо `fk_violation` замість `lww_conflict`,
 * щоб не ховати security-related reject в нормальній conflict-метриці.
 *
 * Soft-delete: `op === "delete"` → ставимо `deleted_at = clientTs`,
 * `updated_at = clientTs`. Жорстке видалення не використовується для
 * Routine, бо клієнт може потім повернути виконання.
 *
 * Tombstone-resurrection guard (Stage 5, дзеркалить PR #043 для
 * `nutrition_meals`): після soft-delete `op='insert'`/`op='update'`
 * проти tombstoned-у ряд відхиляється з `reason='tombstoned'`. Інакше
 * stale offline-edit на одному девайсі скасовував би delete на іншому.
 * `op='delete'` лишається ідемпотентним — re-stamp-ить `deleted_at`
 * новішим `client_ts`.
 */
export async function applyRoutineEntries(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  // Cross-user ownership check. Якщо клієнт надіслав `user_id` у row,
  // воно мусить збігатись із сесією; якщо ні — підставляємо у DML
  // server-side userId, щоб не дозволяти smuggle через payload.
  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  const existing = await client.query<{
    user_id: string;
    updated_at: Date;
    deleted_at: Date | null;
  }>(
    `SELECT user_id, updated_at, deleted_at FROM routine_entries WHERE id = $1`,
    [id],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.user_id !== userId) {
      return { status: "rejected", reason: "fk_violation" };
    }
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
    // Tombstone-resurrection guard — див. док-стрінг.
    if (existing!.rows[0]!.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (existing.rows.length === 0) {
      return { status: "rejected", reason: "not_found" };
    }
    await client.query(
      `UPDATE routine_entries
         SET deleted_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3`,
      [clientTs, id, userId],
    );
    return { status: "applied" };
  }

  const name = typeof row["name"] === "string" ? row["name"] : null;
  if (!name) return { status: "rejected", reason: "missing_name" };

  const completedAt = parseOptionalDate(row["completed_at"]);
  if (completedAt === "invalid") {
    return { status: "rejected", reason: "invalid_completed_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }
  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO routine_entries
         (id, user_id, name, completed_at, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        userId,
        name,
        completedAt ?? null,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE routine_entries
         SET name = $1,
             completed_at = $2,
             updated_at = $3,
             deleted_at = $4
       WHERE id = $5 AND user_id = $6`,
      [name, completedAt ?? null, clientTs, deletedAt ?? null, id, userId],
    );
  }
  return { status: "applied" };
}

/**
 * Apply-шлях для `routine_streaks` (per-user aggregate). PK = user_id,
 * один рядок на юзера; історичного `updated_at` нема. LWW-guard
 * робимо проти `MAX(client_ts)` із `sync_op_log` для (user_id,
 * `routine_streaks`, status='applied') — так v2 не залежить від форми
 * конкретної таблиці й може застосовуватись для будь-якої агрегованої
 * сутності в Stage 4.
 *
 * `delete` — жорстке видалення (немає soft-delete-стовпця). Клієнт
 * рідко це виконує, але семантика синхронна з реальною кнопкою
 * "reset streaks".
 *
 * `increment` (PR #042b) — PN-counter primitive: атомарний
 * `INSERT … ON CONFLICT DO UPDATE SET current_streak =
 * current_streak + delta`, з clamp-ом до `MAX(0, …)` щоб лічильник
 * не йшов у мінус (UI assumes non-negative). `longest_streak` —
 * derived `GREATEST(longest_streak, new_current_streak)`, тобто
 * монотонний максимум за всю історію. LWW-guard НЕ блокує increment-
 * и (інакше другий toggle того самого пристрою з ідентичним `client_ts`
 * губився б), на відміну від insert/update — там LWW потрібен щоб
 * стара версія не перетирала свіжу.
 */
export async function applyRoutineStreaks(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  if (op.op === "increment") {
    if (row["delta"] == null) {
      return { status: "rejected", reason: "missing_delta" };
    }
    if (
      typeof row["delta"] !== "number" ||
      !Number.isFinite(row["delta"]) ||
      !Number.isInteger(row["delta"]) ||
      Math.abs(row["delta"]) > INCREMENT_DELTA_MAX_ABS
    ) {
      return { status: "rejected", reason: "invalid_delta" };
    }
    const delta = row["delta"];
    // Атомарний upsert. Початковий рядок засіюється з `MAX(0, delta)` —
    // якщо клієнт надіслав `delta=-1` без попереднього insert-а, ми не
    // створюємо рядок із `current_streak = -1` (порушує домен-інваріант),
    // а сідаємо у 0. На вже існуючому рядку `current_streak + delta`
    // обчислюється всередині SQL-виразу, тому між двома пушами одного
    // юзера race-condition відсутній (PG row-level lock у тій самій
    // транзакції). `longest_streak = GREATEST(...)` робить максимум
    // монотонним.
    await client.query(
      `INSERT INTO routine_streaks
         (user_id, current_streak, longest_streak, last_completed_at)
       VALUES ($1, GREATEST(0, $2::int), GREATEST(0, $2::int), NULL)
       ON CONFLICT (user_id) DO UPDATE
         SET current_streak =
               GREATEST(0, routine_streaks.current_streak + $2::int),
             longest_streak =
               GREATEST(
                 routine_streaks.longest_streak,
                 GREATEST(0, routine_streaks.current_streak + $2::int)
               )`,
      [userId, delta],
    );
    return { status: "applied" };
  }

  const lwwGuard = await client.query<{ max_ts: Date | null }>(
    `SELECT MAX(client_ts) AS max_ts
       FROM sync_op_log
      WHERE user_id = $1
        AND table_name = 'routine_streaks'
        AND status = 'applied'
        AND op <> 'increment'`,
    [userId],
  );
  if (
    lwwGuard!.rows[0]!.max_ts &&
    lwwGuard!.rows[0]!.max_ts.getTime() >= clientTs.getTime()
  ) {
    return { status: "rejected", reason: "lww_conflict" };
  }

  if (op.op === "delete") {
    await client.query(`DELETE FROM routine_streaks WHERE user_id = $1`, [
      userId,
    ]);
    return { status: "applied" };
  }

  const currentStreak = toNonNegativeInt(row["current_streak"]) ?? 0;
  const longestStreak = toNonNegativeInt(row["longest_streak"]) ?? 0;
  const lastCompletedAt = parseOptionalDate(row["last_completed_at"]);
  if (lastCompletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_last_completed_at" };
  }

  await client.query(
    `INSERT INTO routine_streaks
       (user_id, current_streak, longest_streak, last_completed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET current_streak = EXCLUDED.current_streak,
           longest_streak = EXCLUDED.longest_streak,
           last_completed_at = EXCLUDED.last_completed_at`,
    [userId, currentStreak, longestStreak, lastCompletedAt ?? null],
  );
  return { status: "applied" };
}
