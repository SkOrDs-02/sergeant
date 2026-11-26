import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
  FIZRUK_CLIENT_MIGRATIONS,
  FIZRUK_MIGRATIONS_TABLE,
  NUTRITION_CLIENT_MIGRATIONS,
  NUTRITION_MIGRATIONS_TABLE,
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import type { SyncV2PullOp } from "@sergeant/api-client";

import {
  SAFE_TABLE_SQL,
  SyncTableNotReadyError,
  __resetApplyPullOpCachesForTests,
  applyPullOp,
  getTableColumns,
} from "./applyPullOp.js";

/**
 * `FULL-20261125-DATA-1`: після виходу й повторного входу на тому ж пристрої
 * читач синку тягнув журнал у партицію, де таблиці модуля ще не було.
 * `pragma_table_info` повертав порожньо, оп отримував `rejected`, курсор ішов
 * далі, і рядок на цьому пристрої губився назавжди. До того ж порожній
 * результат кешувався, тож і після міграції таблиця лишалась «відсутньою».
 */
const USER = "user-1";
const TS = "2026-11-25T10:00:00.000Z";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...(params as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

const expenseOp: SyncV2PullOp = {
  id: 1,
  table: "finyk_manual_expenses",
  op: "insert",
  row: {
    id: "mx_1",
    user_id: USER,
    data_json: JSON.stringify({ id: "mx_1", amount: 321 }),
    created_at: TS,
    updated_at: TS,
  },
  client_ts: TS,
  server_ts: TS,
  origin_device_id: "device-b",
};

describe("applyPullOp — таблиця модуля ще не створена", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(() => {
    __resetApplyPullOpCachesForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
  });

  afterEach(() => {
    db.close();
  });

  it("кидає SyncTableNotReadyError, а не повертає rejected", async () => {
    await expect(
      applyPullOp(client, expenseOp, USER, "device-a"),
    ).rejects.toBeInstanceOf(SyncTableNotReadyError);
  });

  it("після міграції той самий оп застосовується: порожня схема не кешується", async () => {
    await expect(
      applyPullOp(client, expenseOp, USER, "device-a"),
    ).rejects.toBeInstanceOf(SyncTableNotReadyError);

    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: FINYK_CLIENT_MIGRATIONS,
      tableName: FINYK_MIGRATIONS_TABLE,
    });

    expect(await applyPullOp(client, expenseOp, USER, "device-a")).toBe(
      "applied",
    );
    const rows = await client.all<{ id: string }>(
      `SELECT id FROM finyk_manual_expenses WHERE user_id = ?`,
      [USER],
    );
    expect(rows).toEqual([{ id: "mx_1" }]);
  });

  // Сторож суворого режиму: таблиця з реєстру, яку не створює жоден із
  // чотирьох мігратрів `ensureModuleSchemas`, зупинила б pull назавжди на
  // першому ж своєму опі. Додаєш таблицю в реєстр — додай і міграцію.
  it("кожну таблицю реєстру створюють чотири модульні міграції", async () => {
    const adapter = createSqliteAdapter(client);
    for (const [files, tableName] of [
      [ROUTINE_CLIENT_MIGRATIONS, ROUTINE_MIGRATIONS_TABLE],
      [FIZRUK_CLIENT_MIGRATIONS, FIZRUK_MIGRATIONS_TABLE],
      [NUTRITION_CLIENT_MIGRATIONS, NUTRITION_MIGRATIONS_TABLE],
      [FINYK_CLIENT_MIGRATIONS, FINYK_MIGRATIONS_TABLE],
    ] as const) {
      await runMigrations({ adapter, files, tableName });
    }
    const missing: string[] = [];
    for (const table of Object.values(SAFE_TABLE_SQL)) {
      if ((await getTableColumns(client, table)).length === 0)
        missing.push(table);
    }
    expect(missing).toEqual([]);
  });
});
