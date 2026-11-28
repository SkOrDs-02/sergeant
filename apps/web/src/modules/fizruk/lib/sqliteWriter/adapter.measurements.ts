import {
  toIntOrNull,
  toRealOrNull,
  type DualWriteRuntime,
} from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import type { FizrukMeasurementSnapshot } from "./diff/index.js";
import {
  MEASUREMENT_DELETE_SQL,
  MEASUREMENT_UPSERT_SQL,
} from "./adapter.sql.js";

// -----------------------------------------------------------------------
// Measurements
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
    // і в SQLite-дзеркалі. Ганяти їх через `toIntOrNull` не можна: 81.4 кг
    // ставало 81, а 7.5 год сну — 8. Пара (локальний рядок, outbox-рядок)
    // МАЄ використовувати ту саму функцію — інакше пристрій пише в базу одне
    // значення, а на сервер шле інше, і LWW починає фліпати вагу між
    // пристроями. `energyLevel` і `mood` лишаються INTEGER — так у PG.
    toRealOrNull(m["weightKg"]),
    toRealOrNull(m["waistCm"]),
    toRealOrNull(m["chestCm"]),
    toRealOrNull(m["hipsCm"]),
    toRealOrNull(m["bicepCm"]),
    // Решта полів веб-форми. До міграції 008 колонок під них не було, і
    // введене користувачем зникало після перезавантаження.
    toRealOrNull(m["bodyFatPct"]),
    toRealOrNull(m["neckCm"]),
    toRealOrNull(m["bicepLCm"]),
    toRealOrNull(m["bicepRCm"]),
    toRealOrNull(m["forearmLCm"]),
    toRealOrNull(m["forearmRCm"]),
    toRealOrNull(m["thighLCm"]),
    toRealOrNull(m["thighRCm"]),
    toRealOrNull(m["calfLCm"]),
    toRealOrNull(m["calfRCm"]),
    toRealOrNull(m["sleepHours"]),
    toIntOrNull(m["energyLevel"]),
    toIntOrNull(m["mood"]),
    clientTs,
    clientTs,
  ]);
  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_measurements",
    op: "insert",
    row: {
      id: m.id,
      user_id: userId,
      measured_at: m.at,
      weight_kg: toRealOrNull(m["weightKg"]),
      waist_cm: toRealOrNull(m["waistCm"]),
      chest_cm: toRealOrNull(m["chestCm"]),
      hips_cm: toRealOrNull(m["hipsCm"]),
      bicep_cm: toRealOrNull(m["bicepCm"]),
      body_fat_pct: toRealOrNull(m["bodyFatPct"]),
      neck_cm: toRealOrNull(m["neckCm"]),
      bicep_l_cm: toRealOrNull(m["bicepLCm"]),
      bicep_r_cm: toRealOrNull(m["bicepRCm"]),
      forearm_l_cm: toRealOrNull(m["forearmLCm"]),
      forearm_r_cm: toRealOrNull(m["forearmRCm"]),
      thigh_l_cm: toRealOrNull(m["thighLCm"]),
      thigh_r_cm: toRealOrNull(m["thighRCm"]),
      calf_l_cm: toRealOrNull(m["calfLCm"]),
      calf_r_cm: toRealOrNull(m["calfRCm"]),
      sleep_hours: toRealOrNull(m["sleepHours"]),
      energy_level: toIntOrNull(m["energyLevel"]),
      mood: toIntOrNull(m["mood"]),
      created_at: clientTs,
      deleted_at: null,
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
  await enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_measurements",
    op: "delete",
    row: { id: measurementId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
