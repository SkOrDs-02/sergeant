import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  applyIfNewer,
  assertRowUserId,
  guardUuidPkApply,
  queryOne,
  type ExistingUuidRow,
  parseOptionalDate,
  readBoolField,
  readJsonbField,
  softDeleteById,
} from "../applySync-helpers.js";
import {
  isValidRecurrence,
  parseOptionalDayKey,
} from "../../../lib/routineScheduleFields.js";

/**
 * `routine_habits.recurrence` / `start_date` / `end_date` — TEXT без CHECK,
 * а щохвилинний sweep нагадувань (`lib/reminders/sweep.ts`) читає їх усіх
 * користувачів одним проходом: рядок `start_date = "2000"` кидав у
 * `parseDateKey` і валив нагадування ВСІМ (аудит 2026-10-01, rel-01).
 * Тому невалідне відхиляється тут, до запису.
 *
 * Відсутнє / порожнє `recurrence` = `daily` (старі клієнти, домен читає
 * `recurrence || "daily"`). Невалідний оп -> `rejected` із причиною; клієнт
 * позначає його термінально (`pushLoop`: `rejected` не ретраїться), тож
 * безкінечного повтору немає, решта батчу йде далі.
 */
function readHabitScheduleFields(row: Record<string, unknown>):
  | {
      recurrence: string;
      startDate: string | null;
      endDate: string | null;
    }
  | { reject: AppliedStatus } {
  const rawRecurrence = row["recurrence"];
  if (!isValidRecurrence(rawRecurrence)) {
    return { reject: { status: "rejected", reason: "invalid_recurrence" } };
  }
  const recurrence =
    typeof rawRecurrence === "string" && rawRecurrence !== ""
      ? rawRecurrence
      : "daily";
  const startDate = parseOptionalDayKey(row["start_date"]);
  if (startDate === "invalid") {
    return { reject: { status: "rejected", reason: "invalid_start_date" } };
  }
  const endDate = parseOptionalDayKey(row["end_date"]);
  if (endDate === "invalid") {
    return { reject: { status: "rejected", reason: "invalid_end_date" } };
  }
  return { recurrence, startDate, endDate };
}

export async function applyRoutineHabits(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM routine_habits WHERE id = $1`,
    [id],
  );
  const guard = guardUuidPkApply(existing, userId, clientTs);
  if (guard) return guard;

  if (op.op === "delete") {
    return softDeleteById(
      client,
      "routine_habits",
      id,
      userId,
      clientTs,
      existing,
    );
  }

  const name = typeof row["name"] === "string" ? row["name"] : null;
  if (!name) return { status: "rejected", reason: "missing_name" };

  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  const schedule = readHabitScheduleFields(row);
  if ("reject" in schedule) return schedule.reject;

  const emoji = typeof row["emoji"] === "string" ? row["emoji"] : "";
  const tagIds = readJsonbField(row, "tag_ids", "tag_ids_json", "[]");
  const categoryId =
    typeof row["category_id"] === "string" ? row["category_id"] : null;
  const reminderTimes = readJsonbField(
    row,
    "reminder_times",
    "reminder_times_json",
    "[]",
  );
  const weekdays = readJsonbField(
    row,
    "weekdays",
    "weekdays_json",
    "[0,1,2,3,4,5,6]",
  );
  // Датовані інтервали паузи (Хвиля 4). Старі клієнти поля не шлють —
  // `readJsonbField` віддасть дефолт, і колонка лишиться порожнім масивом.
  const pauseIntervals = readJsonbField(
    row,
    "pause_intervals",
    "pause_intervals_json",
    "[]",
  );
  const weeklyTargetHistory = readJsonbField(
    row,
    "weekly_target_history",
    "weekly_target_history_json",
    "[]",
  );

  if (!existing) {
    await client.query(
      `INSERT INTO routine_habits
         (id, user_id, name, emoji, tag_ids, category_id,
          archived, paused, recurrence, start_date, end_date,
          time_of_day, reminder_times, weekdays, pause_intervals,
          weekly_target_history, created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11,
               $12, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17, $18, $19)`,
      [
        id,
        userId,
        name,
        emoji,
        tagIds,
        categoryId,
        readBoolField(row, "archived"),
        readBoolField(row, "paused"),
        schedule.recurrence,
        schedule.startDate,
        schedule.endDate,
        typeof row["time_of_day"] === "string" ? row["time_of_day"] : "",
        reminderTimes,
        weekdays,
        pauseIntervals,
        weeklyTargetHistory,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    return applyIfNewer(
      client,
      `UPDATE routine_habits
         SET name = $1, emoji = $2, tag_ids = $3::jsonb, category_id = $4,
             archived = $5, paused = $6, recurrence = $7,
             start_date = $8, end_date = $9, time_of_day = $10,
             reminder_times = $11::jsonb, weekdays = $12::jsonb,
             pause_intervals = $13::jsonb,
             weekly_target_history = $14::jsonb,
             updated_at = $15, deleted_at = $16
       WHERE id = $17 AND user_id = $18 AND updated_at < $15`,
      [
        name,
        emoji,
        tagIds,
        categoryId,
        readBoolField(row, "archived"),
        readBoolField(row, "paused"),
        schedule.recurrence,
        schedule.startDate,
        schedule.endDate,
        typeof row["time_of_day"] === "string" ? row["time_of_day"] : "",
        reminderTimes,
        weekdays,
        pauseIntervals,
        weeklyTargetHistory,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

export async function applyUuidNameScopeTable(
  client: PoolClient,
  table: "routine_tags" | "routine_categories",
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const id = typeof row["id"] === "string" ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const selectSql =
    table === "routine_tags"
      ? `SELECT user_id, updated_at, deleted_at FROM routine_tags WHERE id = $1`
      : `SELECT user_id, updated_at, deleted_at FROM routine_categories WHERE id = $1`;
  const existing = await queryOne<ExistingUuidRow>(client, selectSql, [id]);
  const guard = guardUuidPkApply(existing, userId, clientTs);
  if (guard) return guard;

  if (op.op === "delete") {
    return softDeleteById(client, table, id, userId, clientTs, existing);
  }

  const name = typeof row["name"] === "string" ? row["name"] : null;
  if (!name) return { status: "rejected", reason: "missing_name" };

  const createdAt = parseOptionalDate(row["created_at"]);
  if (createdAt === "invalid") {
    return { status: "rejected", reason: "invalid_created_at" };
  }
  const deletedAt = parseOptionalDate(row["deleted_at"]);
  if (deletedAt === "invalid") {
    return { status: "rejected", reason: "invalid_deleted_at" };
  }

  if (table === "routine_categories") {
    const emoji = typeof row["emoji"] === "string" ? row["emoji"] : "";
    if (!existing) {
      await client.query(
        `INSERT INTO routine_categories
           (id, user_id, name, emoji, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          userId,
          name,
          emoji,
          createdAt ?? clientTs,
          clientTs,
          deletedAt ?? null,
        ],
      );
    } else {
      return applyIfNewer(
        client,
        `UPDATE routine_categories
           SET name = $1, emoji = $2, updated_at = $3, deleted_at = $4
         WHERE id = $5 AND user_id = $6 AND updated_at < $3`,
        [name, emoji, clientTs, deletedAt ?? null, id, userId],
      );
    }
  } else {
    const scope = typeof row["scope"] === "string" ? row["scope"] : "";
    if (!existing) {
      await client.query(
        `INSERT INTO routine_tags
           (id, user_id, name, scope, created_at, updated_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          userId,
          name,
          scope,
          createdAt ?? clientTs,
          clientTs,
          deletedAt ?? null,
        ],
      );
    } else {
      return applyIfNewer(
        client,
        `UPDATE routine_tags
           SET name = $1, scope = $2, updated_at = $3, deleted_at = $4
         WHERE id = $5 AND user_id = $6 AND updated_at < $3`,
        [name, scope, clientTs, deletedAt ?? null, id, userId],
      );
    }
  }
  return { status: "applied" };
}

export async function applyRoutinePrefs(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const dataJson = readJsonbField(row, "data", "data_json");
  return applyIfNewer(
    client,
    `INSERT INTO routine_prefs (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
       WHERE routine_prefs.updated_at < EXCLUDED.updated_at`,
    [userId, dataJson, clientTs],
  );
}

export async function applyRoutineHabitOrder(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const orderJson = readJsonbField(row, "order", "order_json");
  return applyIfNewer(
    client,
    `INSERT INTO routine_habit_order (user_id, "order", updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET "order" = EXCLUDED."order", updated_at = EXCLUDED.updated_at
       WHERE routine_habit_order.updated_at < EXCLUDED.updated_at`,
    [userId, orderJson, clientTs],
  );
}

export async function applyRoutineCompletionNotes(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const noteKey = typeof row["note_key"] === "string" ? row["note_key"] : null;
  if (!noteKey) return { status: "rejected", reason: "missing_note_key" };

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM routine_completion_notes WHERE user_id = $1 AND note_key = $2`,
    [userId, noteKey],
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
      `UPDATE routine_completion_notes
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND note_key = $3 AND updated_at < $1`,
      [clientTs, userId, noteKey],
    );
  }

  const note = typeof row["note"] === "string" ? row["note"] : "";
  return applyIfNewer(
    client,
    `INSERT INTO routine_completion_notes (user_id, note_key, note, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (user_id, note_key) DO UPDATE
       SET note = EXCLUDED.note, updated_at = EXCLUDED.updated_at, deleted_at = NULL
       WHERE routine_completion_notes.updated_at < EXCLUDED.updated_at`,
    [userId, noteKey, note, clientTs],
  );
}

/**
 * Третій стан дня — «не зміг з причиною» (Хвиля 4, канон `routine.md` §5).
 *
 * Форма один-в-один як `applyRoutineCompletionNotes`: композитний PK
 * `(user_id, skip_key)`, LWW по `updated_at`, upsert зі скиданням
 * `deleted_at` (воскресіння новішим записом — див. `guardUuidPkApply`).
 *
 * AI-NOTE: взаємну виключність із відміткою виконання сервер НЕ навʼязує.
 * Два девайси можуть надіслати «зробив» і «не зміг» на той самий день —
 * розсуджує їх LWW за часом, а не відмова обом. Клієнтський домен
 * (`applySetHabitSkip`) тримає інваріант локально.
 */
export async function applyRoutineHabitSkips(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const skipKey = typeof row["skip_key"] === "string" ? row["skip_key"] : null;
  if (!skipKey) return { status: "rejected", reason: "missing_skip_key" };

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM routine_habit_skips WHERE user_id = $1 AND skip_key = $2`,
    [userId, skipKey],
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
      `UPDATE routine_habit_skips
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND skip_key = $3 AND updated_at < $1`,
      [clientTs, userId, skipKey],
    );
  }

  // `reason` навмисно не валідується проти серверного enum — словник причин
  // живе в домені й може рости, а нерозпізнане значення клієнт зводить до
  // `other` при нормалізації. Серверний enum означав би, що додавання
  // причини вимагає деплою бекенду перед фронтом.
  const reason = typeof row["reason"] === "string" ? row["reason"] : "other";
  const note = typeof row["note"] === "string" ? row["note"] : "";
  const at = parseOptionalDate(row["at"]);
  if (at === "invalid") return { status: "rejected", reason: "invalid_at" };

  return applyIfNewer(
    client,
    `INSERT INTO routine_habit_skips (user_id, skip_key, reason, note, at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     ON CONFLICT (user_id, skip_key) DO UPDATE
       SET reason = EXCLUDED.reason, note = EXCLUDED.note, at = EXCLUDED.at,
           updated_at = EXCLUDED.updated_at, deleted_at = NULL
       WHERE routine_habit_skips.updated_at < EXCLUDED.updated_at`,
    [userId, skipKey, reason, note, at ?? clientTs, clientTs],
  );
}
