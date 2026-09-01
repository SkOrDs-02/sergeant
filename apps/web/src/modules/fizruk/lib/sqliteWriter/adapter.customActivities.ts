/**
 * Last validated: 2026-09-01
 * Status: Active
 *
 * Dual-write своїх занять (`fizruk_custom_activities`, міграція 132).
 *
 * Винесено з `adapter.ts` заради module-size (Hard Rule #18): сам адаптер
 * уже впритул до 600 рядків, і будь-яка нова таблиця його перевищує.
 * Форма рядка - JSON-блоб, як у своїх вправ.
 */

import type { DualWriteRuntime } from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import type { FizrukCustomActivitySnapshot } from "./diff/index.js";
import {
  CUSTOM_ACTIVITY_DELETE_SQL,
  CUSTOM_ACTIVITY_UPSERT_SQL,
} from "./adapter.sql.js";

export async function upsertCustomActivity(
  client: SqliteMigrationClient,
  activity: FizrukCustomActivitySnapshot,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  const dataJson = JSON.stringify(activity);
  await client.run(CUSTOM_ACTIVITY_UPSERT_SQL, [
    activity.id,
    userId,
    dataJson,
    clientTs,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_custom_activities",
    op: "insert",
    row: {
      id: activity.id,
      user_id: userId,
      data_json: dataJson,
      created_at: clientTs,
      deleted_at: null,
    },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}

export async function softDeleteCustomActivity(
  client: SqliteMigrationClient,
  activityId: string,
  { userId, clientTs }: DualWriteRuntime,
): Promise<void> {
  await client.run(CUSTOM_ACTIVITY_DELETE_SQL, [
    clientTs,
    clientTs,
    activityId,
    userId,
    clientTs,
  ]);
  void enqueueOutboxUpsert(client, {
    userId,
    table: "fizruk_custom_activities",
    op: "delete",
    row: { id: activityId, user_id: userId },
    clientTs,
    idempotencyKey: crypto.randomUUID(),
  }).catch(() => {});
}
