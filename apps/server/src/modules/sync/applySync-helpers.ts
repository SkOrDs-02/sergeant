import type { PoolClient } from "pg";
import {
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalNumber,
  parseRequiredDate,
  toJsonbParam,
  toNonNegativeInt,
} from "./syncV2-core.js";
import type { AppliedStatus } from "./syncV2-types.js";

export type ExistingUuidRow = {
  user_id: string;
  updated_at: Date;
  deleted_at: Date | null;
};

export function assertRowUserId(
  row: Record<string, unknown>,
  userId: string,
): AppliedStatus | null {
  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }
  return null;
}

/**
 * Канонічний guard для UUID-PK таблиць: чужий рядок, LWW, і все.
 *
 * AI-DANGER: тут НЕМАЄ і не має бути перевірки
 * `deleted_at !== null && op.op !== "delete" → tombstoned`. Вона тут була і
 * її знято свідомо — не «загублено» при рефакторингу. Не повертай.
 *
 * Чому вона була неправильна. Уся синхронізація живе за LWW: видалення — це
 * просто ще один запис із міткою часу, а перемагає останній. Перевірка на
 * `deleted_at` стояла ПІСЛЯ LWW-перевірки, тож у неї фізично не міг
 * потрапити запис, старіший за видалення — такий уже відсіяно як
 * `lww_conflict`. Долітав лише запис, НОВІШИЙ за видалення, тобто рівно той,
 * який за правилами LWW має вигравати. Тобто це був єдиний виняток, що
 * суперечив моделі решти системи.
 *
 * Чого вона коштувала. Undo після видалення повертає той самий рядок із тим
 * самим id (`BudgetsLimitsSection.tsx` → `showUndoToast`, `useMeasurements`
 * → `restoreEntry`). Сервер відхиляв його як `tombstoned`, клієнт позначав
 * операцію в аутбоксі `rejected` НАЗАВЖДИ, і запис лишався тільки локально:
 * на екрані є, на сервері немає, на іншому пристрої немає. Мовчки. Прод:
 * `SERGEANT-WEB-T`, `finyk_budgets.insert`.
 *
 * Ціна зняття, свідомо прийнята власником: офлайн-пристрій, який не бачив
 * видалення і зробив правку ПІЗНІШЕ за нього, тепер воскрешає запис замість
 * того, щоб мовчки його втратити. Це звичайний LWW-компроміс, той самий, що
 * діє для кожного іншого поля.
 *
 * Воскресіння окремого SQL не потребує: шлях UPDATE у кожному хендлері вже
 * пише `deleted_at` зі вхідного рядка, а відновлений рядок несе `null`.
 */
export function guardUuidPkApply(
  existing: ExistingUuidRow | undefined,
  userId: string,
  clientTs: Date,
): AppliedStatus | null {
  if (!existing) return null;
  if (existing.user_id !== userId) {
    return { status: "rejected", reason: "fk_violation" };
  }
  if (existing.updated_at.getTime() >= clientTs.getTime()) {
    return { status: "rejected", reason: "lww_conflict" };
  }
  return null;
}

const OWNED_PARENT_SQL = {
  fizruk_workouts: `SELECT 1 FROM fizruk_workouts WHERE id = $1 AND user_id = $2`,
  fizruk_workout_items: `SELECT 1 FROM fizruk_workout_items WHERE id = $1 AND user_id = $2`,
} as const;

/**
 * Guard батьківського рядка для дочірніх sync-таблиць з ОДНОКОЛОНКОВИМ FK
 * (`fizruk_workout_items.workout_id`, `fizruk_workout_sets.workout_item_id`).
 *
 * Чому він потрібен. PK батьківських таблиць глобальний (`id` без `user_id`),
 * а FK `child.parent_id -> parent(id)` не знає про власника. Без цієї перевірки
 * користувач B міг записати власний item/set під ЧУЖЕ тренування A (досить
 * знати id): рядок несе `user_id = B`, тож apply його приймав, а каскад
 * `ON DELETE CASCADE` пізніше стирав дані B разом із батьком A, і підходи B
 * висіли на сутності, до якої B не має стосунку (аудит 2026-10-01, `data-01`).
 *
 * AI-DANGER: «батька немає» і «батько чужий» тут навмисно дають ОДНАКОВУ
 * відповідь (`fk_violation`). Розведення причин зробило б із sync-відповіді
 * оракул існування чужих id. Не додавай окремий reason без рішення власника.
 *
 * `deleted_at` батька НЕ перевіряємо: soft-deleted батько лишається ВЛАСНИМ
 * рядком, а дитина, що доїхала після видалення батька, — звичайний LWW.
 *
 * Це тимчасовий шар: коли PK таблиць стане складеним `(user_id, id)` разом із
 * складеним FK (крок 2 `data-01`, двофазна міграція), перевірка стане
 * надлишковою, але нічого не ламатиме.
 */
export async function guardParentOwned(
  client: PoolClient,
  parentTable: keyof typeof OWNED_PARENT_SQL,
  parentId: string,
  userId: string,
): Promise<AppliedStatus | null> {
  const res = await client.query(OWNED_PARENT_SQL[parentTable], [
    parentId,
    userId,
  ]);
  if (res.rows.length === 0) {
    return { status: "rejected", reason: "fk_violation" };
  }
  return null;
}

export async function queryOne<T extends Record<string, unknown>>(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<T | undefined> {
  const existing = await client.query<T>(sql, params);
  return existing.rows[0];
}

export async function softDeleteById(
  client: PoolClient,
  table:
    | "routine_habits"
    | "routine_tags"
    | "routine_categories"
    | "fizruk_daily_log"
    | "fizruk_workout_templates",
  id: string,
  userId: string,
  clientTs: Date,
  existing: ExistingUuidRow | undefined,
): Promise<AppliedStatus> {
  if (!existing) return { status: "rejected", reason: "not_found" };
  const sqlByTable = {
    routine_habits: `UPDATE routine_habits SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3 AND updated_at < $1`,
    routine_tags: `UPDATE routine_tags SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3 AND updated_at < $1`,
    routine_categories: `UPDATE routine_categories SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3 AND updated_at < $1`,
    fizruk_daily_log: `UPDATE fizruk_daily_log SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3 AND updated_at < $1`,
    fizruk_workout_templates: `UPDATE fizruk_workout_templates SET deleted_at = $1, updated_at = $1 WHERE id = $2 AND user_id = $3 AND updated_at < $1`,
  } as const;
  return applyIfNewer(client, sqlByTable[table], [clientTs, id, userId]);
}

/**
 * Виконує запис, у SQL якого вже стоїть LWW-предикат «строго новіший»
 * (`ON CONFLICT … DO UPDATE … WHERE <t>.updated_at < EXCLUDED.updated_at` або
 * `UPDATE … AND updated_at < $clientTs`), і 0 зачеплених рядків звітує як
 * `lww_conflict`, тобто так само, як відсів за SELECT-ом.
 *
 * AI-DANGER: LWW має перевіряти сама база в тому ж операторі, що й пише.
 * Пара «SELECT без FOR UPDATE → порівняння в JS → безумовний upsert» під
 * READ COMMITTED програє гонку двох паралельних пушів: новіший коміт
 * проходить першим, старіший другим і перезаписує його. Той самий предикат
 * стоїть у `packages/dualwrite-core/src/tableSpec.ts` (`upsertGuard`).
 */
export async function applyIfNewer(
  client: PoolClient,
  sql: string,
  params: unknown[],
): Promise<AppliedStatus> {
  const res = await client.query(sql, params);
  if (res.rowCount === 0) {
    return { status: "rejected", reason: "lww_conflict" };
  }
  return { status: "applied" };
}

/**
 * Жорстке видалення з тим самим предикатом `AND updated_at < $clientTs`.
 * Якщо SELECT рядка не бачив, видаляти нічого і це `applied`, як і раніше;
 * якщо бачив, а DELETE не зачепив нічого, рядок встиг оновити новіший пуш.
 */
export async function deleteIfNewer(
  client: PoolClient,
  sql: string,
  params: unknown[],
  existed: boolean,
): Promise<AppliedStatus> {
  const res = await applyIfNewer(client, sql, params);
  return existed ? res : { status: "applied" };
}

/** Accept PG key or SQLite `*_json` alias; coerce to JSONB bind param. */
export function readJsonbField(
  row: Record<string, unknown>,
  pgKey: string,
  sqliteKey?: string,
  fallback = "null",
): string {
  const raw =
    row[pgKey] ??
    (sqliteKey ? row[sqliteKey] : undefined) ??
    (pgKey === "data" ? row["data_json"] : undefined) ??
    (pgKey === "order" ? row["order_json"] : undefined);
  if (raw == null) return fallback;
  return toJsonbParam(raw) ?? fallback;
}

export function readBoolField(
  row: Record<string, unknown>,
  key: string,
): boolean {
  const raw = row[key];
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  return false;
}

export {
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalNumber,
  parseRequiredDate,
  toJsonbParam,
  toNonNegativeInt,
};
