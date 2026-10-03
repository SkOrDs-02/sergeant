import {
  buildDelete,
  buildLwwUpsert,
  toIntOrNull,
  toRealOrNull,
  type DualWriteRuntime,
  type TableSpec,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "@/core/syncEngine/enqueueOutboxUpsert";
import type { FizrukMeasurementSnapshot } from "./diff";

// -----------------------------------------------------------------------
// Table spec
// -----------------------------------------------------------------------

const MEASUREMENT_UPSERT_SPEC: TableSpec = {
  table: "fizruk_measurements",
  insertClause: `INSERT INTO fizruk_measurements
       (id, user_id, measured_at, weight_kg, waist_cm, chest_cm, hips_cm,
        bicep_cm, sleep_hours, energy_level, mood,
        created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
  conflictTarget: ["id"],
  updateColumns: [
    { column: "measured_at" },
    { column: "weight_kg" },
    { column: "waist_cm" },
    { column: "chest_cm" },
    { column: "hips_cm" },
    { column: "bicep_cm" },
    { column: "sleep_hours" },
    { column: "energy_level" },
    { column: "mood" },
    { column: "updated_at" },
    { column: "deleted_at", value: "NULL" },
  ],
  upsertGuard: "strictly-newer",
  conflictIndent: 5,
  setIndent: 7,
};

const MEASUREMENT_UPSERT_SQL = buildLwwUpsert(MEASUREMENT_UPSERT_SPEC);
const MEASUREMENT_DELETE_SQL = buildDelete({
  table: "fizruk_measurements",
  deletePolicy: "soft",
  matchColumns: ["id", "user_id"],
});

// -----------------------------------------------------------------------
// Measurement upsert / soft-delete
// -----------------------------------------------------------------------

export async function upsertMeasurement(
  client: SqliteMigrationClient,
  m: FizrukMeasurementSnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MEASUREMENT_UPSERT_SQL, [
    m.id,
    userId,
    m.at,
    // AI-DANGER: ці шість полів — REAL і в Postgres (`029_fizruk_tables.sql`),
    // і в SQLite-дзеркалі. `toIntOrNull` перетворював 81.4 кг на 81, а 7.5 год
    // сну на 8. Локальний рядок і outbox-рядок МАЮТЬ іти через ту саму
    // функцію, інакше LWW фліпає значення між пристроями.
    // `energyLevel` і `mood` лишаються INTEGER — так у PG.
    toRealOrNull(m.weightKg),
    toRealOrNull(m.waistCm),
    toRealOrNull(m.chestCm),
    toRealOrNull(m.hipsCm),
    toRealOrNull(m.bicepCm),
    toRealOrNull(m.sleepHours),
    toIntOrNull(m.energyLevel),
    toIntOrNull(m.mood),
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_measurements",
    op: "insert",
    row: {
      id: m.id,
      user_id: userId,
      measured_at: m.at,
      weight_kg: toRealOrNull(m.weightKg),
      waist_cm: toRealOrNull(m.waistCm),
      chest_cm: toRealOrNull(m.chestCm),
      hips_cm: toRealOrNull(m.hipsCm),
      bicep_cm: toRealOrNull(m.bicepCm),
      sleep_hours: toRealOrNull(m.sleepHours),
      energy_level: toIntOrNull(m.energyLevel),
      mood: toIntOrNull(m.mood),
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

export async function softDeleteMeasurement(
  client: SqliteMigrationClient,
  measurementId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(MEASUREMENT_DELETE_SQL, [
    clientTs,
    clientTs,
    measurementId,
    userId,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_measurements",
    op: "delete",
    row: { id: measurementId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
