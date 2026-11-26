/**
 * Прибирання дітей, яких уже немає в масиві батька (підходи, вилучені з
 * вправи; вправи, вилучені з тренування), із tombstone-ом у sync-outbox
 * (FULL-20261126-FIZRUK-1).
 *
 * AI-DANGER: самого локального `UPDATE … SET deleted_at` мало. Сервер про
 * нього не знає, рядок лишається живим у `fizruk_workout_sets`, і новий
 * пристрій після входу «воскрешає» видалений підхід. Кожен рядок, якому тут
 * ставиться tombstone, мусить поїхати в outbox як `delete`.
 *
 * Id підходів позиційні (`${itemId}:s${index}`): після видалення НЕ
 * останнього підходу значення зсуваються вгору (upsert-и s0..s(n-1) їдуть
 * у outbox із новими значеннями), а id «хвоста» s(n) більше не в `keepIds`,
 * тож отримує tombstone тут. Сервер сходиться з локальним станом за будь-якої
 * позиції видаленого підходу.
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";
import { softDeleteRemovedChildren } from "./adapter.sql.js";

export async function reconcileRemovedChildren(
  client: SqliteMigrationClient,
  tableName: string,
  parentCol: string,
  parentId: string,
  userId: string,
  clientTs: string,
  keepIds: string[],
): Promise<void> {
  // Ті самі умови, що й в UPDATE (`buildReconcileChildren` з LWW-захистом):
  // зібрати id ДО апдейту, бо після нього `deleted_at` уже не NULL.
  const notIn =
    keepIds.length > 0
      ? ` AND id NOT IN (${keepIds.map(() => "?").join(",")})`
      : "";
  const doomed = await client.all<{ id: string }>(
    `SELECT id FROM ${tableName}
      WHERE ${parentCol} = ? AND user_id = ? AND deleted_at IS NULL${notIn}
        AND updated_at < ?`,
    [parentId, userId, ...keepIds, clientTs],
  );

  await softDeleteRemovedChildren(
    client,
    tableName,
    parentCol,
    parentId,
    userId,
    clientTs,
    keepIds,
  );

  for (const { id } of doomed) {
    await enqueueOutboxUpsert(client, {
      userId,
      table: tableName,
      op: "delete",
      row: { id, user_id: userId },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }
}
