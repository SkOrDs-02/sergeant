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

  // Прибрана вправа тягне за собою свої підходи (A2): інакше вони лишаються
  // осиротілими живими рядками і локально, і на сервері.
  if (tableName === "fizruk_workout_items" && doomed.length > 0) {
    const ph = doomed.map(() => "?").join(",");
    const doomedIds = doomed.map((d) => d.id);
    const orphanSets = await client.all<{ id: string }>(
      `SELECT id FROM fizruk_workout_sets
        WHERE workout_item_id IN (${ph}) AND user_id = ?
          AND deleted_at IS NULL AND updated_at < ?`,
      [...doomedIds, userId, clientTs],
    );
    if (orphanSets.length > 0) {
      await client.run(
        `UPDATE fizruk_workout_sets
            SET deleted_at = ?, updated_at = ?
          WHERE workout_item_id IN (${ph}) AND user_id = ?
            AND deleted_at IS NULL AND updated_at < ?`,
        [clientTs, clientTs, ...doomedIds, userId, clientTs],
      );
    }
    for (const { id } of orphanSets) {
      await enqueueOutboxUpsert(client, {
        userId,
        table: "fizruk_workout_sets",
        op: "delete",
        row: { id, user_id: userId },
        clientTs,
        idempotencyKey: crypto.randomUUID(),
      }).catch(() => {});
    }
  }
}
