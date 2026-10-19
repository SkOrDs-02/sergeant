/**
 * Дельта комори відносно SQLite (rel-10 + data-40).
 *
 * `changedItemIds` з `diff.pantryDelta.ts` пораховано відносно `prev`, а `prev`
 * - це warm-кеш, який міг відстати від SQLite (частково доїхавший pull, кеш ще
 * не перечитано). Якщо рядок, що в SQLite відсутній або відрізняється, не
 * переписати, його наступна правка програє LWW або взагалі не дійде до сервера.
 * Тому до дельти з `prev` додаємо все, що в SQLite відсутнє під цим id або має
 * інші значення: рядок, якого локально немає, пишемо завжди.
 *
 * data-40: id стабільні, тож порівняння іде за id, а не за позицією. Окремо
 * тут рахується `sort_order`. Видалення позиції лишає ДІРКУ в послідовності
 * (0, 2, 3), і це нормально: рідер сортує за `sort_order`, дірка порядку не
 * ламає. Переписувати всі наступні рядки «щоб без дірок» не можна: кожен такий
 * запис несе новий `client_ts` і перебиває паралельну правку цього рядка з
 * іншого пристрою. Тому існуючій позиції зберігається її `sort_order`, якщо
 * порядок за `(sort_order, id)` уже збігається зі списком; нова або
 * «пересунута» отримує `max(індекс, попередній + 1)`.
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

export interface PantryItemsReconcile {
  /** id позицій, які треба записати (дельта + розбіжності з SQLite + порядок). */
  readonly changed: Set<string>;
  /** `sort_order`, який треба записати для кожної позиції списку. */
  readonly sortOrder: Map<string, number>;
}

/**
 * Зводить дельту з `prev` зі станом SQLite: що саме писати і з яким
 * `sort_order`.
 */
export async function reconcilePantryItemsWithSqlite(
  client: SqliteMigrationClient,
  pantryId: string,
  userId: string,
  items: readonly NutritionPantryItemSnapshot[],
  deltaChanged: ReadonlySet<string>,
): Promise<PantryItemsReconcile> {
  const rows = await client.all<PantryItemRow>(
    `SELECT id, name, qty, unit, notes, sources, sort_order
       FROM nutrition_pantry_items
      WHERE pantry_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [pantryId, userId],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const changed = new Set(deltaChanged);
  const sortOrder = new Map<string, number>();
  let last = -1;
  let lastId = "";
  items.forEach((it, index) => {
    const row = byId.get(it.id);
    if (
      !row ||
      (row.name ?? "") !== (it.name ?? "") ||
      (row.qty ?? null) !== toRealOrNull(it.qty) ||
      (row.unit ?? null) !== (it.unit ?? null) ||
      (row.notes ?? null) !== (it.notes ?? null) ||
      (row.sources ?? null) !== (it.sources ?? null)
    ) {
      changed.add(it.id);
    }
    const stored = row?.sort_order ?? null;
    let order: number;
    // Рідер сортує `sort_order ASC, id ASC`: рівний `sort_order` (дві позиції,
    // додані паралельно з різних пристроїв) уже дає потрібний порядок, якщо id
    // зростають, і переписувати такий рядок не треба.
    if (
      stored !== null &&
      (stored > last || (stored === last && it.id > lastId))
    ) {
      order = stored;
    } else {
      order = Math.max(index, last + 1);
      changed.add(it.id);
    }
    sortOrder.set(it.id, order);
    last = order;
    lastId = it.id;
  });
  return { changed, sortOrder };
}
