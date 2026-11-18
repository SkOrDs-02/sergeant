import type { PoolClient } from "pg";
import { isExerciseMeasure } from "@sergeant/shared";
import type { SyncV2Op } from "../../../http/schemas.js";
import type { AppliedStatus } from "../syncV2-types.js";
import {
  applyIfNewer,
  assertRowUserId,
  queryOne,
  type ExistingUuidRow,
} from "../applySync-helpers.js";

/**
 * Памʼять людини про тип виміру вправи (`fizruk_exercise_prefs`, міграція
 * 173, спека `docs/work/specs/fizruk-exercise-measure-type.md`, рішення
 * Р-2). Рядок на вправу: `id` = id вправи каталогу чи власної, `measure` —
 * тип, який людина обрала в перемикачі сесії.
 *
 * Форма за зразком `applyRoutineHabitCounts`: PK `(user_id, id)`, LWW по
 * `updated_at` (два пристрої на одній вправі — виграє новіший; різні вправи
 * не конфліктують), upsert скидає `deleted_at` (повторний вибір воскрешає
 * рядок), `delete` = soft-delete, тобто «повернути дефолт каталогу».
 *
 * Перелік типів тримає `EXERCISE_MEASURES` (`@sergeant/shared`); CHECK у
 * Postgres перевіряє лише форму ідентифікатора, тож незнайомий тип
 * відхиляється тут, до запису (`invalid_measure`).
 */
export async function applyFizrukExercisePrefs(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  const row = op.row;
  const userReject = assertRowUserId(row, userId);
  if (userReject) return userReject;

  const id = typeof row["id"] === "string" && row["id"] ? row["id"] : null;
  if (!id) return { status: "rejected", reason: "missing_id" };

  const measure = row["measure"];
  if (op.op !== "delete" && !isExerciseMeasure(measure)) {
    return { status: "rejected", reason: "invalid_measure" };
  }

  const existing = await queryOne<ExistingUuidRow>(
    client,
    `SELECT user_id, updated_at, deleted_at FROM fizruk_exercise_prefs WHERE user_id = $1 AND id = $2`,
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
      `UPDATE fizruk_exercise_prefs
         SET deleted_at = $1, updated_at = $1
       WHERE user_id = $2 AND id = $3 AND updated_at < $1`,
      [clientTs, userId, id],
    );
  }

  return applyIfNewer(
    client,
    `INSERT INTO fizruk_exercise_prefs (id, user_id, measure, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, NULL)
     ON CONFLICT (user_id, id) DO UPDATE
       SET measure = EXCLUDED.measure, updated_at = EXCLUDED.updated_at,
           deleted_at = NULL
       WHERE fizruk_exercise_prefs.updated_at < EXCLUDED.updated_at`,
    [id, userId, measure, clientTs],
  );
}
