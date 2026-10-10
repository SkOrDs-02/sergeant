/**
 * Поелементне видалення позицій комори (data-40).
 *
 * Стабільні id дозволяють видаляти РІВНО те, що прибрала людина, замість
 * неявного «усе, чого немає в знімку» (`softDeleteRemovedChildren` нижче, який
 * лишається для повних знімків: перший запис місця і op без дельти). Видалення прив'язане і до `pantry_id`, тож позиція, яку вже
 * переписали в інше місце (переїзд зберігає id), не зачіпається.
 */
import { buildReconcileChildren } from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { enqueueOutboxUpsert } from "../../../../core/syncEngine/enqueueOutboxUpsert.js";

export async function softDeletePantryItemsById(
  client: SqliteMigrationClient,
  pantryId: string,
  userId: string,
  clientTs: string,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  const live = await client.all<{ id: string }>(
    `SELECT id FROM nutrition_pantry_items
      WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL
        AND id IN (${placeholders})`,
    [pantryId, userId, ...ids],
  );
  if (live.length === 0) return;
  const livePlaceholders = live.map(() => "?").join(",");
  await client.run(
    `UPDATE nutrition_pantry_items
        SET deleted_at = ?, updated_at = ?
      WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL
        AND id IN (${livePlaceholders})`,
    [clientTs, clientTs, pantryId, userId, ...live.map((r) => r.id)],
  );
  for (const it of live) {
    void enqueueOutboxUpsert(client, {
      userId,
      table: "nutrition_pantry_items",
      op: "delete",
      row: { id: it.id, user_id: userId },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }
}

/**
 * Soft-delete children of a pantry that are no longer in `keepIds`.
 * Delegates the SQL to `buildReconcileChildren` (both the empty and
 * NOT IN branches) — the params are laid out to match each branch.
 * Also enqueues a delete outbox op for each item that will be removed.
 */
export async function softDeleteRemovedChildren(
  client: SqliteMigrationClient,
  parentId: string,
  userId: string,
  clientTs: string,
  keepIds: readonly string[],
): Promise<void> {
  const sql = buildReconcileChildren(
    { table: "nutrition_pantry_items", parentColumn: "pantry_id" },
    keepIds.length,
  );
  const BASE_QUERY = `SELECT id FROM nutrition_pantry_items WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL`;
  let toDelete: Array<{ id: string }>;
  if (keepIds.length === 0) {
    toDelete = await client.all<{ id: string }>(BASE_QUERY, [parentId, userId]);
    await client.run(sql, [clientTs, clientTs, parentId, userId]);
  } else {
    const placeholders = keepIds.map(() => "?").join(",");
    toDelete = await client.all<{ id: string }>(
      `${BASE_QUERY} AND id NOT IN (${placeholders})`,
      [parentId, userId, ...keepIds],
    );
    await client.run(sql, [clientTs, clientTs, parentId, userId, ...keepIds]);
  }
  for (const it of toDelete) {
    void enqueueOutboxUpsert(client, {
      userId,
      table: "nutrition_pantry_items",
      op: "delete",
      row: { id: it.id, user_id: userId },
      clientTs,
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => {});
  }
}
