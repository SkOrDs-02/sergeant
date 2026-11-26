/**
 * Запис підходу Фізрука в SQLite + outbox (винесено з `adapter.ts`, ліміт
 * 600 рядків) і колонки типу виміру (міграції 172 / клієнтська 010, спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`).
 *
 * AI-CONTEXT: ключі `duration_sec` / `distance_m` / `measure` новий клієнт
 * шле ЗАВЖДИ, навіть null. Старий сервер (вікно деплою) їх ігнорує, але
 * `sync_op_log` зберігає повний рядок, тож інші пристрої отримують значення
 * pull-ом, а таблиці сервера доганяє бекфіл міграції 172 з журналу.
 *
 * Так само `done` / `set_type` (міграція 176 / клієнтська 012, спека
 * `fizruk-set-done-flag-and-set-type.md`): ключі завжди в рядку outbox, у
 * синк `done` іде boolean (`true` / `false` / `null`), у SQLite — 1 / 0 /
 * NULL. Відсутній прапорець (ретро, імпорт, записи до фічі) пишеться NULL:
 * стан тоді виводиться з значень, як до фічі.
 */

import { isExerciseMeasure } from "@sergeant/fizruk-domain";
import { isWorkoutSetType } from "@sergeant/shared";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import type { WorkoutSet } from "./adapter.js";
import { WORKOUT_SET_UPSERT_SQL } from "./adapter.sql.js";
import { liveRowUnchanged } from "./adapter.unchanged.js";

function intOrNull(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n)
    ? null
    : Math.round(n);
}

/** `measure` для колонки: лише значення з переліку, інакше NULL. */
export function itemMeasureColumn(item: {
  [k: string]: unknown;
}): string | null {
  const m = item["measure"];
  return isExerciseMeasure(m) ? m : null;
}

/** `done` для синку: лише boolean, решта — NULL (запис до фічі). */
export function setDoneValue(set: { [k: string]: unknown }): boolean | null {
  const v = set["done"];
  return typeof v === "boolean" ? v : null;
}

/** `set_type` для колонки: лише значення з переліку, інакше NULL. */
export function setTypeColumn(set: { [k: string]: unknown }): string | null {
  const v = set["setType"];
  return isWorkoutSetType(v) ? v : null;
}

export async function upsertWorkoutSet(
  client: SqliteMigrationClient,
  setId: string,
  workoutItemId: string,
  userId: string,
  clientTs: string,
  set: WorkoutSet,
  sortOrder: number,
): Promise<void> {
  const durationSec = intOrNull(set["durationSec"]);
  const distanceM = intOrNull(set["distanceM"]);
  const done = setDoneValue(set);
  const setType = setTypeColumn(set);
  // Незмінений підхід не чіпаємо (B7a): ні нового `updated_at`, ні outbox-оп.
  if (
    await liveRowUnchanged(client, "fizruk_workout_sets", setId, userId, {
      workout_item_id: workoutItemId,
      weight_kg: set.weightKg ?? 0,
      reps: set.reps ?? 0,
      rpe: set.rpe ?? null,
      sort_order: sortOrder,
      duration_sec: durationSec,
      distance_m: distanceM,
      done,
      set_type: setType,
    })
  ) {
    return;
  }
  await client.run(WORKOUT_SET_UPSERT_SQL, [
    setId,
    workoutItemId,
    userId,
    set.weightKg ?? 0,
    set.reps ?? 0,
    set.rpe ?? null,
    sortOrder,
    clientTs,
    clientTs,
    durationSec,
    distanceM,
    done === null ? null : done ? 1 : 0,
    setType,
  ]);

  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_workout_sets",
    op: "insert",
    row: {
      id: setId,
      user_id: userId,
      workout_item_id: workoutItemId,
      weight_kg: set.weightKg ?? 0,
      reps: set.reps ?? 0,
      rpe: set.rpe ?? null,
      duration_sec: durationSec,
      distance_m: distanceM,
      done,
      set_type: setType,
      sort_order: sortOrder,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
