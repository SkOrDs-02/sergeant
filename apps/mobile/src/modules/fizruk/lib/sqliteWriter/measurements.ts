import {
  buildDelete,
  buildLwwUpsert,
  toIntOrNull,
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
    toIntOrNull(m.weightKg),
    toIntOrNull(m.waistCm),
    toIntOrNull(m.chestCm),
    toIntOrNull(m.hipsCm),
    toIntOrNull(m.bicepCm),
    toIntOrNull(m.sleepHours),
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
      weight_kg: toIntOrNull(m.weightKg),
      waist_cm: toIntOrNull(m.waistCm),
      chest_cm: toIntOrNull(m.chestCm),
      hips_cm: toIntOrNull(m.hipsCm),
      bicep_cm: toIntOrNull(m.bicepCm),
      sleep_hours: toIntOrNull(m.sleepHours),
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
