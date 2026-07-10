import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  assertRowUserId,
  guardUuidPkApply,
  guardUserPkLww,
  queryOne,
  type ExistingUuidRow,
  parseOptionalDate,
  readBoolField,
  readJsonbField,
  softDeleteById,
  toNonNegativeInt,
} from "../applySync-helpers.js";

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
  const guard = guardUuidPkApply(existing, userId, clientTs, op);
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

  if (!existing) {
    await client.query(
      `INSERT INTO routine_habits
         (id, user_id, name, emoji, tag_ids, category_id,
          archived, paused, recurrence, start_date, end_date,
          time_of_day, reminder_times, weekdays,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11,
               $12, $13::jsonb, $14::jsonb, $15, $16, $17)`,
      [
        id,
        userId,
        name,
        emoji,
        tagIds,
        categoryId,
        readBoolField(row, "archived"),
        readBoolField(row, "paused"),
        typeof row["recurrence"] === "string" ? row["recurrence"] : "daily",
        typeof row["start_date"] === "string" ? row["start_date"] : null,
        typeof row["end_date"] === "string" ? row["end_date"] : null,
        typeof row["time_of_day"] === "string" ? row["time_of_day"] : "",
        reminderTimes,
        weekdays,
        createdAt ?? clientTs,
        clientTs,
        deletedAt ?? null,
      ],
    );
  } else {
    await client.query(
      `UPDATE routine_habits
         SET name = $1, emoji = $2, tag_ids = $3::jsonb, category_id = $4,
             archived = $5, paused = $6, recurrence = $7,
             start_date = $8, end_date = $9, time_of_day = $10,
             reminder_times = $11::jsonb, weekdays = $12::jsonb,
             updated_at = $13, deleted_at = $14
       WHERE id = $15 AND user_id = $16`,
      [
        name,
        emoji,
        tagIds,
        categoryId,
        readBoolField(row, "archived"),
        readBoolField(row, "paused"),
        typeof row["recurrence"] === "string" ? row["recurrence"] : "daily",
        typeof row["start_date"] === "string" ? row["start_date"] : null,
        typeof row["end_date"] === "string" ? row["end_date"] : null,
        typeof row["time_of_day"] === "string" ? row["time_of_day"] : "",
        reminderTimes,
        weekdays,
        clientTs,
        deletedAt ?? null,
        id,
        userId,
      ],
    );
  }
  return { status: "applied" };
}

async function applyUuidNameScopeTable(
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
  const guard = guardUuidPkApply(existing, userId, clientTs, op);
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
      await client.query(
        `UPDATE routine_categories
           SET name = $1, emoji = $2, updated_at = $3, deleted_at = $4
         WHERE id = $5 AND user_id = $6`,
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
      await client.query(
        `UPDATE routine_tags
           SET name = $1, scope = $2, updated_at = $3, deleted_at = $4
         WHERE id = $5 AND user_id = $6`,
        [name, scope, clientTs, deletedAt ?? null, id, userId],
      );
    }
  }
  return { status: "applied" };
}

export async function applyRoutineTags(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyUuidNameScopeTable(client, "routine_tags", op, userId, clientTs);
}

export async function applyRoutineCategories(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  return applyUuidNameScopeTable(
    client,
    "routine_categories",
    op,
    userId,
    clientTs,
  );
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

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM routine_prefs WHERE user_id = $1`,
    [userId],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const dataJson = readJsonbField(row, "data", "data_json");
  await client.query(
    `INSERT INTO routine_prefs (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [userId, dataJson, clientTs],
  );
  return { status: "applied" };
}

export async function applyRoutinePushups(
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

  const dateKey = typeof row["date_key"] === "string" ? row["date_key"] : null;
  if (!dateKey) return { status: "rejected", reason: "missing_date_key" };

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM routine_pushups WHERE user_id = $1 AND date_key = $2`,
    [userId, dateKey],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const reps = toNonNegativeInt(row["reps"]) ?? 0;
  await client.query(
    `INSERT INTO routine_pushups (user_id, date_key, reps, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, date_key) DO UPDATE
       SET reps = EXCLUDED.reps, updated_at = EXCLUDED.updated_at`,
    [userId, dateKey, reps, clientTs],
  );
  return { status: "applied" };
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

  const existing = await queryOne<{ user_id: string; updated_at: Date }>(
    client,
    `SELECT user_id, updated_at FROM routine_habit_order WHERE user_id = $1`,
    [userId],
  );
  const guard = guardUserPkLww(existing, clientTs);
  if (guard) return guard;

  const orderJson = readJsonbField(row, "order", "order_json");
  await client.query(
    `INSERT INTO routine_habit_order (user_id, "order", updated_at)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO UPDATE
       SET "order" = EXCLUDED."order", updated_at = EXCLUDED.updated_at`,
    [userId, orderJson, clientTs],
  );
  return { status: "applied" };
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
    if (existing.deleted_at !== null && op.op !== "delete") {
      return { status: "rejected", reason: "tombstoned" };
    }
  }

  if (op.op === "delete") {
    if (!existing) return { status: "rejected", reason: "not_found" };
    await client.query(
      `UPDATE routine_completion_notes
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND note_key = $3`,
      [clientTs, userId, noteKey],
    );
    return { status: "applied" };
  }

  const note = typeof row["note"] === "string" ? row["note"] : "";
  await client.query(
    `INSERT INTO routine_completion_notes (user_id, note_key, note, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (user_id, note_key) DO UPDATE
       SET note = EXCLUDED.note, updated_at = EXCLUDED.updated_at, deleted_at = NULL`,
    [userId, noteKey, note, clientTs],
  );
  return { status: "applied" };
}
