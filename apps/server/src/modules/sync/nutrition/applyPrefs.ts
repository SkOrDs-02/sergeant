import type { PoolClient } from "pg";
import { NUTRITION_PREFS_MERGE_FIELD } from "@sergeant/shared";

import type { SyncV2Op } from "../../../http/schemas.js";
import { toJsonbParam } from "../syncV2-core.js";
import type { AppliedStatus } from "../syncV2-types.js";
import { applyIfNewer } from "../applySync-helpers.js";

/**
 * Розібрати `prefs_json` патча в plain-обʼєкт. `null`, якщо це не JSON-обʼєкт
 * (масив, скаляр, нерозбірний рядок): злити такий патч нема з чим.
 */
function parsePrefsPatch(raw: unknown): Record<string, unknown> | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Журнал і pull бачать повний знімок без merge-прапорця (див. AI-DANGER). */
function rewriteRowAsFullSnapshot(
  row: Record<string, unknown>,
  fullPrefsJson: string,
): void {
  row["prefs_json"] = fullPrefsJson;
  delete row[NUTRITION_PREFS_MERGE_FIELD];
}

/**
 * `nutrition_prefs` — singleton-рядок користувача, LWW за `updated_at`.
 *
 * Дві семантики запису `prefs_json`:
 *  - без `prefs_merge` (усі наявні клієнти): повна заміна, як і раніше;
 *  - із `prefs_merge: true` (data-04): `prefs_json` це патч верхніх ключів,
 *    який накладається на серверний знімок (`existing || patch`). Ключі, яких
 *    нема в патчі, лишаються. Контракт — `@sergeant/shared`
 *    (`nutritionPrefsSync.ts`).
 *
 * AI-DANGER: для merge-опа `op.row` ПЕРЕПИСУЄТЬСЯ на злитий повний знімок без
 * прапорця. `syncV2.ts` кладе `op.row` у `sync_op_log` ПІСЛЯ apply, а pull
 * реплеїть журнал на інші пристрої як повну заміну prefs. Якби там лежав
 * голий патч, кожен інший пристрій затер би свої prefs патчем.
 */
export async function applyNutritionPrefs(
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
): Promise<AppliedStatus> {
  if (op.op === "delete") {
    return { status: "rejected", reason: "delete_not_supported" };
  }

  const row = op.row;

  if (row["user_id"] == null) {
    return { status: "rejected", reason: "missing_user_id" };
  }
  if (row["user_id"] !== userId) {
    return { status: "rejected", reason: "user_id_mismatch" };
  }

  let patch: Record<string, unknown> | null = null;
  if (row[NUTRITION_PREFS_MERGE_FIELD] === true) {
    patch = parsePrefsPatch(row["prefs_json"]);
    if (!patch) return { status: "rejected", reason: "invalid_prefs_patch" };
  }

  const existing = await client.query<{ user_id: string; updated_at: Date }>(
    `SELECT user_id, updated_at FROM nutrition_prefs WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    if (existing!.rows[0]!.updated_at.getTime() >= clientTs.getTime()) {
      return { status: "rejected", reason: "lww_conflict" };
    }
  }

  const prefsJson = patch
    ? JSON.stringify(patch)
    : (toJsonbParam(row["prefs_json"]) ?? "{}");
  const activePantryId =
    typeof row["active_pantry_id"] === "string"
      ? row["active_pantry_id"]
      : null;

  if (existing.rows.length === 0) {
    await client.query(
      `INSERT INTO nutrition_prefs
         (user_id, prefs_json, active_pantry_id, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5)`,
      [userId, prefsJson, activePantryId, clientTs, clientTs],
    );
    if (patch) rewriteRowAsFullSnapshot(row, prefsJson);
    return { status: "applied" };
  }

  if (!patch) {
    return applyIfNewer(
      client,
      `UPDATE nutrition_prefs
         SET prefs_json       = $1::jsonb,
             active_pantry_id = $2,
             updated_at       = $3
       WHERE user_id = $4 AND updated_at < $3`,
      [prefsJson, activePantryId, clientTs, userId],
    );
  }

  // Злиття в самому операторі: LWW-предикат і `||` бачать один знімок рядка
  // (як у `applyIfNewer`). Не-обʼєктний серверний знімок (не повинно бути, але
  // колонка jsonb) замінюється патчем замість того, щоб `||` склеїв масив.
  // `active_pantry_id` теж патчиться: відсутній ключ лишає серверне значення.
  const merged = await client.query<{ prefs_json: unknown }>(
    `UPDATE nutrition_prefs
        SET prefs_json       = CASE
                                 WHEN jsonb_typeof(prefs_json) = 'object'
                                   THEN prefs_json || $1::jsonb
                                 ELSE $1::jsonb
                               END,
            active_pantry_id = CASE WHEN $5::boolean THEN $2
                                    ELSE active_pantry_id END,
            updated_at       = $3
      WHERE user_id = $4 AND updated_at < $3
      RETURNING prefs_json`,
    [prefsJson, activePantryId, clientTs, userId, "active_pantry_id" in row],
  );
  const mergedRow = merged.rows[0];
  if (!mergedRow) return { status: "rejected", reason: "lww_conflict" };
  rewriteRowAsFullSnapshot(row, JSON.stringify(mergedRow.prefs_json));
  return { status: "applied" };
}
