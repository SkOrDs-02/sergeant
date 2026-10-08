/**
 * Регресія живого прогону 2026-10-08 (`data-durability`, реєстрація без
 * анонімних даних): перший запис Фініку на свіжій партиції потрапляв у
 * `sync_op_outbox` ПОСЕРЕД клієнтських міграцій — таблиця вже була, колонки
 * `user_id` (міграція 006) ще ні. `INSERT` падав на `no such column: user_id`,
 * адаптер модуля ковтав помилку, і запис не їхав на сервер до наступного буту.
 *
 * Тут справжній SQLite (better-sqlite3) і справжні клієнтські міграції.
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";

import { migrateRoutine } from "../../modules/routine/lib/clientMigrate";
import { enqueueOutboxUpsert } from "./enqueueOutboxUpsert.js";

const USER = "usr_real_better_auth_id";

function makeSqliteClient(db: BetterSqliteDatabase): SqliteMigrationClient {
  return {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
}

function finykInput(key: string) {
  return {
    userId: USER,
    table: "finyk_manual_expenses",
    op: "insert" as const,
    row: { id: key, user_id: USER, data_json: "{}" },
    clientTs: "2026-10-08T16:00:00.000Z",
    idempotencyKey: key,
  };
}

describe("enqueueOutboxUpsert — схема черги на свіжій партиції", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;

  beforeEach(() => {
    db = new Database(":memory:");
    client = makeSqliteClient(db);
  });

  afterEach(() => {
    db.close();
  });

  const outboxRows = () =>
    db.prepare(`SELECT user_id, table_name FROM sync_op_outbox`).all();

  it("доводить схему до кінця, коли запис застає міграції на півдорозі (до 006 `user_id`)", async () => {
    // Рівно стан із живого прогону: 001–005 уже застосовано іншим бутом.
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS.filter((f) => f.name < "006"),
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });

    const result = await enqueueOutboxUpsert(client, finykInput("op-1"));

    expect(result).toMatchObject({ inserted: true, skipped: null });
    expect(outboxRows()).toEqual([
      { user_id: USER, table_name: "finyk_manual_expenses" },
    ]);
  });

  it("пише в чергу на партиції, де міграцій ще не було зовсім", async () => {
    const result = await enqueueOutboxUpsert(client, finykInput("op-1"));

    expect(result).toMatchObject({ inserted: true, skipped: null });
    expect(outboxRows()).toHaveLength(1);
  });

  it("не гоняється з бутом Рутини, що мігрує ту саму партицію одночасно", async () => {
    // Бут Рутини і перший запис Фініку стартують з одного кадру. Два різні
    // мігратори тих самих файлів падали б на журналі
    // (`SQLITE_CONSTRAINT_UNIQUE`), тож вони мусять стояти в одній черзі.
    const [, result] = await Promise.all([
      migrateRoutine(client),
      enqueueOutboxUpsert(client, finykInput("op-1")),
    ]);

    expect(result).toMatchObject({ inserted: true, skipped: null });
    expect(outboxRows()).toHaveLength(1);
  });

  it("анонімний запис схему не чіпає і в чергу не йде", async () => {
    const result = await enqueueOutboxUpsert(client, {
      ...finykInput("op-1"),
      userId: "local-anon",
    });

    expect(result).toEqual({
      id: null,
      inserted: false,
      skipped: "non-syncable-user",
    });
    expect(
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='sync_op_outbox'`,
        )
        .all(),
    ).toHaveLength(0);
  });
});
