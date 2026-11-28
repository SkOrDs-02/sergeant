/**
 * Last validated: 2026-11-26
 * Status: Active
 *
 * Одноразове «донесення бази prefs» для акаунтів, що застрягли з
 * FULL-20261126-NUTR-1.
 *
 * AI-CONTEXT: до фіксу сервера кожен push `nutrition_prefs` ішов патчем
 * (`prefs_merge: true`) без серверного рядка і отримував
 * `retry / prefs_patch_without_base`, доки оп не ставав `dead_letter` (10
 * спроб). Таблиця на сервері лишалась порожньою, тож цілі нового акаунта не
 * доїжджали на інші пристрої. Сервер тепер приймає такий патч як створення,
 * але мертві оп-и самі не поїдуть, а нових змін prefs може й не бути. Тому
 * після завершеного першого pull (локальні prefs уже злиті з серверними, тож
 * повний знімок нічого не затре) кладемо в outbox ОДИН повний знімок
 * локального рядка. Раз на пару (пристрій, акаунт).
 */
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

import { getSqliteDb } from "../../../core/db/sqlite.js";
import { enqueueOutboxUpsert } from "../../../core/syncEngine/enqueueOutboxUpsert.js";
import { buildPrefsOutboxRow } from "./sqliteWriter/diff.prefsPatch.js";

export const PREFS_BASE_RESYNC_KEY = "nutrition_prefs_base_resync_v1";

type PrefsRow = {
  prefs_json: string | null;
  active_pantry_id: string | null;
};

export async function resyncNutritionPrefsBaseOnce(
  userId: string,
): Promise<"done" | "skipped" | "no-row"> {
  const flagKey = `${PREFS_BASE_RESYNC_KEY}:${userId}`;
  if (safeReadLS<boolean>(flagKey, false) === true) return "skipped";

  const handle = await getSqliteDb();
  const client = handle.migrationClient();
  const rows = await client.all<PrefsRow>(
    `SELECT prefs_json, active_pantry_id FROM nutrition_prefs WHERE user_id = ?`,
    [userId],
  );
  const row = rows[0];
  if (!row) {
    // Prefs ще ніхто не писав: нема чого доносити, а мітку не ставимо, бо
    // перший запис піде вже повним/патчем і сервер його прийме.
    return "no-row";
  }
  await enqueueOutboxUpsert(client, {
    userId,
    table: "nutrition_prefs",
    op: "update",
    row: {
      ...buildPrefsOutboxRow(userId, {
        prefsJson: row.prefs_json ?? "{}",
        activePantryId: row.active_pantry_id ?? null,
      }),
    },
    clientTs: new Date().toISOString(),
    idempotencyKey: crypto.randomUUID(),
  });
  safeWriteLS(flagKey, true);
  return "done";
}
