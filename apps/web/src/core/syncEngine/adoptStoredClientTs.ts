import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import {
  getPrimaryKeyColumns,
  getTableColumns,
  SAFE_TABLE_SQL,
} from "./applyPullOp.js";

/**
 * Локальна мітка рядка після обрізки на сервері (data-51, rv-sync-clock).
 *
 * Сервер пише `updated_at = min(client_ts, server_now)`. Пристрій, що
 * поспішає (скажімо, +90 с), локально тримає `updated_at = client_ts`
 * пристрою, а свій оп ніколи не отримає назад: pull і SSE фільтрують власні
 * оп-и за origin. Тоді чужа правка, яка на сервері виграла (пізніша за
 * обрізану мітку, але раніша за локальну), на цьому пристрої скіпається
 * `isStaleLocal` у `applyPullOp`, і рядок розходиться до наступної правки.
 *
 * Тому мітку, яку сервер записав (`result.client_ts` у відповіді push),
 * пишемо в локальний рядок, але лише якщо там досі надіслана мітка: новіша
 * локальна правка вже лежить у черзі й отримає власну обрізку. `deleted_at`
 * з тією самою міткою (локальне видалення пише їх однаковими) рухається
 * разом, щоб tombstone лишався узгодженим з `updated_at`.
 *
 * Таблиці без `updated_at` (журнали, `routine_streaks`) і `increment` LWW не
 * мають, тож для них це no-op. Повертає `true`, коли рядок переписано.
 */
export async function adoptStoredClientTs(
  client: SqliteMigrationClient,
  input: {
    readonly table: string;
    readonly op: string;
    readonly row: Readonly<Record<string, unknown>>;
    readonly sentClientTs: string;
    readonly storedClientTs: string;
  },
): Promise<boolean> {
  if (input.op === "increment") return false;
  const safeTable = SAFE_TABLE_SQL[input.table];
  if (safeTable === undefined) return false;

  const columns = await getTableColumns(client, safeTable);
  if (!columns.includes("updated_at")) return false;
  const pkColumns = await getPrimaryKeyColumns(client, safeTable);
  if (pkColumns.length === 0) return false;

  const pkValues = pkColumns.map((col) => {
    const value = input.row[col];
    return typeof value === "string" || typeof value === "number"
      ? value
      : null;
  });
  if (pkValues.some((value) => value === null)) return false;

  const userId = input.row["user_id"];
  const scopeByUser =
    columns.includes("user_id") &&
    !pkColumns.includes("user_id") &&
    typeof userId === "string";
  const where = [
    ...pkColumns.map((col) => `${col} = ?`),
    ...(scopeByUser ? ["user_id = ?"] : []),
    "julianday(updated_at) = julianday(?)",
  ].join(" AND ");
  const setDeleted = columns.includes("deleted_at")
    ? `, deleted_at = CASE WHEN julianday(deleted_at) = julianday(?) THEN ? ELSE deleted_at END`
    : "";

  const changed = await client.all(
    `UPDATE ${safeTable}
        SET updated_at = ?${setDeleted}
      WHERE ${where}
      RETURNING 1 AS adopted`,
    [
      input.storedClientTs,
      ...(setDeleted ? [input.sentClientTs, input.storedClientTs] : []),
      ...(pkValues as (string | number)[]),
      ...(scopeByUser ? [userId as string] : []),
      input.sentClientTs,
    ],
  );
  return changed.length > 0;
}
