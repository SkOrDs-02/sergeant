/**
 * Чи збігається живий локальний рядок із тим, що збираємось записати
 * (FULL-20261126-FIZRUK B7a).
 *
 * AI-DANGER: `workout-upsert` несе знімок ВСЬОГО тренування. Без цієї
 * перевірки кожне збереження ставило новий `updated_at` і слало в outbox
 * upsert КОЖНОГО підходу й вправи, а не лише зміненого. За LWW такий
 * «незмінений» upsert з новішим `clientTs` затирав на сервері чужу зміну
 * того самого підходу з іншого пристрою (втрата даних). Незмінений живий
 * рядок не пишемо і в outbox не віддаємо: `updated_at` лишається старим.
 * Рядок із `deleted_at` не вважається незмінним (воскресіння — це зміна).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

type Cell = string | number | null;

function norm(v: unknown): Cell {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" || typeof v === "string") return v;
  return String(v);
}

export async function liveRowUnchanged(
  client: SqliteMigrationClient,
  table: string,
  id: string,
  userId: string,
  expected: Record<string, unknown>,
): Promise<boolean> {
  const cols = Object.keys(expected);
  let rows: Record<string, unknown>[];
  try {
    rows = await client.all<Record<string, unknown>>(
      `SELECT ${cols.join(", ")} FROM ${table}
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [id, userId],
    );
  } catch {
    return false;
  }
  const row = rows[0];
  if (!row) return false;
  return cols.every((c) => norm(row[c]) === norm(expected[c]));
}
