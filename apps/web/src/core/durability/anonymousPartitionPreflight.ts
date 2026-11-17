/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Preflight розвідки анонімної партиції перед переносом у профіль
 * (`anonymousDataMigration.ts`). Аудит 2026-10-01, `ux-01`.
 */
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import { LOCAL_ANON_USER_ID } from "../auth/localIdentity.js";
import { CLIENT_PULL_SUPPORTED_TABLES } from "../syncEngine/applyPullOp.js";

/**
 * Таблиці анонімної партиції, які не належать жодному модулю: їх створює
 * бут KV-сховища (`kvStoreBoot.ts`), що завжди стартує на `anon`, і сам
 * SQLite. Рядків для переносу в них немає за побудовою.
 */
const NON_MODULE_TABLES: ReadonlySet<string> = new Set([
  "kv_store",
  "__kv_store_migrations",
]);

/**
 * Дешева перевірка до важких кроків розвідки: чи ДОВЕДЕНО, що в анонімній
 * партиції нема рядків для переносу.
 *
 * AI-DANGER: `"empty"` — це твердження з доказом, а не «не знайшли». Будь-яка
 * невизначеність (виняток, незнайома таблиця, неповний журнал міграцій)
 * віддає `"probe"`, тобто повну розвідку як і раніше. Пропущений перенос —
 * це анонімні рядки, до яких більше ніхто не повернеться.
 *
 * Чому журнал міграцій мусить бути ПОВНИМ, а не лише «рядків нема». Частина
 * клієнтських міграцій переносить дані з таблиць поза
 * `CLIENT_PULL_SUPPORTED_TABLES` у таблиці з нього: живий приклад —
 * `007_fizruk_pushups_to_workouts.sql` (`fizruk_pushups` → `fizruk_workouts`
 * і далі). На старій анонімній партиції рядок лічильника віджимань стає
 * тренуванням лише ПІСЛЯ `migrateModuleSchemas`, тож preflight по самих лише
 * таблицях переносу пропустив би його. Тому рядки рахуємо лише тоді, коли
 * всі чотири журнали вже повні (тоді `migrateModuleSchemas` і так нічого б
 * не застосував), а свіжий файл без жодного модульного журналу й без жодної
 * модульної таблиці визнаємо порожнім одразу: міграції створили б лише
 * порожні таблиці. Саме цей випадок — вхід у наявний акаунт на новому
 * пристрої — і коштував секунди (аудит 2026-10-01, `ux-01`).
 */
export async function preflightAnonymousRows(
  client: SqliteMigrationClient,
): Promise<"empty" | "probe"> {
  try {
    const listed = await client.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table'`,
      [],
    );
    const tables = new Set(listed.map((row) => row.name));
    const {
      ROUTINE_CLIENT_MIGRATIONS,
      ROUTINE_MIGRATIONS_TABLE,
      FIZRUK_CLIENT_MIGRATIONS,
      FIZRUK_MIGRATIONS_TABLE,
      NUTRITION_CLIENT_MIGRATIONS,
      NUTRITION_MIGRATIONS_TABLE,
      FINYK_CLIENT_MIGRATIONS,
      FINYK_MIGRATIONS_TABLE,
    } = await import("@sergeant/db-schema/sqlite/migrations");
    const ledgers = [
      [ROUTINE_MIGRATIONS_TABLE, ROUTINE_CLIENT_MIGRATIONS],
      [FIZRUK_MIGRATIONS_TABLE, FIZRUK_CLIENT_MIGRATIONS],
      [NUTRITION_MIGRATIONS_TABLE, NUTRITION_CLIENT_MIGRATIONS],
      [FINYK_MIGRATIONS_TABLE, FINYK_CLIENT_MIGRATIONS],
    ] as const;

    if (!ledgers.some(([ledger]) => tables.has(ledger))) {
      for (const table of tables) {
        if (table.startsWith("sqlite_") || NON_MODULE_TABLES.has(table))
          continue;
        return "probe";
      }
      return "empty";
    }

    for (const [ledger, files] of ledgers) {
      if (!tables.has(ledger)) return "probe";
      const applied = await client.all<{ name: string }>(
        `SELECT name FROM ${ledger}`,
        [],
      );
      const names = new Set(applied.map((row) => row.name));
      if (files.some((file) => !names.has(file.name))) return "probe";
    }

    for (const table of CLIENT_PULL_SUPPORTED_TABLES) {
      if (!tables.has(table)) continue;
      const hit = await client.all(
        `SELECT 1 AS hit FROM ${table} WHERE user_id = ? LIMIT 1`,
        [LOCAL_ANON_USER_ID],
      );
      if (hit.length > 0) return "probe";
    }
    return "empty";
  } catch {
    return "probe";
  }
}
