/**
 * Дельта комори відносно SQLite (rel-10, зауваження ревʼю).
 *
 * `changedItemIds` з `diff.pantryDelta.ts` пораховано відносно `prev`, а `prev`
 * - це warm-кеш, у якому id позицій ВИВЕДЕНО заново з позиції в кеші
 * (`${pantryId}::${idx}::${name}`, після `normalizePantries`, що викидає
 * позиції з порожнім name; `sqliteReader` id рядків відкидає). Тому похідний id
 * незмінної позиції не обовʼязково збігається з id її рядка в SQLite (збіг
 * `sort_order` після pull з іншого пристрою, порожній name, частково доїхавший
 * pull). Якщо такий рядок не переписати під похідним id, `softDeleteRemovedChildren`
 * вважає його видаленим і ставить delete в outbox: позиція зникає на всіх
 * пристроях.
 *
 * Тому до дельти з `prev` додаємо все, що в SQLite відсутнє під цим id або має
 * інші значення: рядок, якого локально немає, пишемо завжди.
 */
import { toRealOrNull } from "@sergeant/dualwrite-core";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type { NutritionPantryItemSnapshot } from "./diff.js";

type PantryItemRow = {
  readonly id: string;
  readonly name: string | null;
  readonly qty: number | null;
  readonly unit: string | null;
  readonly notes: string | null;
  readonly sources: string | null;
  readonly sort_order: number | null;
};

/** id позицій `items`, яких у SQLite немає живими під цим id або значення яких інші. */
export async function itemIdsDivergingFromSqlite(
  client: SqliteMigrationClient,
  pantryId: string,
  userId: string,
  items: readonly NutritionPantryItemSnapshot[],
): Promise<string[]> {
  const rows = await client.all<PantryItemRow>(
    `SELECT id, name, qty, unit, notes, sources, sort_order
       FROM nutrition_pantry_items
      WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [pantryId, userId],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const diverging: string[] = [];
  items.forEach((it, index) => {
    const row = byId.get(it.id);
    if (
      !row ||
      (row.name ?? "") !== (it.name ?? "") ||
      (row.qty ?? null) !== toRealOrNull(it.qty) ||
      (row.unit ?? null) !== (it.unit ?? null) ||
      (row.notes ?? null) !== (it.notes ?? null) ||
      (row.sources ?? null) !== (it.sources ?? null) ||
      (row.sort_order ?? 0) !== index
    ) {
      diverging.push(it.id);
    }
  });
  return diverging;
}
