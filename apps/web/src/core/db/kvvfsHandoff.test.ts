// @vitest-environment jsdom
/**
 * Перелиття старої бази в OPFS — стадія 2 спеки `sqlite-opfs-worker.md`.
 *
 * Найцінніше тут — підчищання партицій. У kvvfs усі акаунти пристрою
 * лежать в одному блобі, в OPFS кожен має свій файл; тобто після
 * побайтового імпорту файл акаунта А спершу містить рядки акаунта Б.
 * Помилка в цьому кроці не падає й не видно на око — вона просто лишає
 * чужі дані в чужому файлі.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isHandoffDone,
  markHandoffDone,
  pruneForeignPartitionRows,
} from "./kvvfsHandoff";
import type { SqliteConnection } from "./sqliteConnection";

type Executed = { sql: string; bind: readonly unknown[] };

function fakeConnection(tables: Record<string, string[]>): {
  conn: SqliteConnection;
  executed: Executed[];
  execed: string[];
} {
  const executed: Executed[] = [];
  const execed: string[] = [];
  const conn: SqliteConnection = {
    exec: vi.fn(async (sql: string) => {
      execed.push(sql);
    }),
    run: vi.fn(async (sql: string, bind: readonly unknown[]) => {
      executed.push({ sql, bind });
    }),
    all: vi.fn(async (sql: string, bind: readonly unknown[]) => {
      if (sql.includes("sqlite_master")) {
        return Object.keys(tables).map((name) => ({ name }));
      }
      if (sql.includes("pragma_table_info")) {
        const table = String(bind[0]);
        return (tables[table] ?? []).map((name) => ({ name }));
      }
      return [];
    }),
    close: vi.fn(async () => {}),
  };
  return { conn, executed, execed };
}

beforeEach(() => {
  localStorage.clear();
});

describe("позначка перелиття", () => {
  it("стоїть лише після явної відмітки і живе окремо на партицію", () => {
    expect(isHandoffDone("anon")).toBe(false);
    markHandoffDone("anon");

    expect(isHandoffDone("anon")).toBe(true);
    // Партиції переливаються незалежно: відмітка однієї нічого не каже
    // про іншу, інакше акаунт успадкував би «вже перелито» від анона.
    expect(isHandoffDone("user42")).toBe(false);
  });
});

describe("pruneForeignPartitionRows", () => {
  it("чистить лише таблиці з колонкою user_id", async () => {
    const { conn, executed, execed } = fakeConnection({
      routine_entries: ["id", "user_id", "day"],
      sync_op_outbox: ["id", "user_id", "row"],
      // Журнал міграцій партиції не має — його чіпати не можна взагалі.
      _migrations: ["name", "applied_at"],
    });

    const pruned = await pruneForeignPartitionRows(conn, "user42");

    expect(pruned).toBe(2);
    expect(executed.map((e) => e.sql)).toEqual([
      "DELETE FROM routine_entries WHERE user_id IS NULL OR user_id <> ?",
      "DELETE FROM sync_op_outbox WHERE user_id IS NULL OR user_id <> ?",
    ]);
    expect(executed[0]?.bind).toEqual(["user42"]);
    // `DELETE` звільняє сторінки, але не стирає їх — без VACUUM рядки
    // чужого акаунта лишились би читабельними у файлі цієї партиції.
    expect(execed).toContain("VACUUM");
  });

  it("на анонімній партиції лишає саме синтетичні id", async () => {
    const { conn, executed } = fakeConnection({
      routine_entries: ["id", "user_id"],
    });

    await pruneForeignPartitionRows(conn, null);

    // `local-anon` і `demo-local` — це і є анонімна партиція; усе інше
    // належить акаунтам і поїде у власні файли.
    expect(executed[0]?.sql).toBe(
      "DELETE FROM routine_entries WHERE user_id IS NULL OR user_id NOT IN (?, ?)",
    );
    expect(executed[0]?.bind).toEqual(["local-anon", "demo-local"]);
  });

  it("не підставляє в SQL імена таблиць химерної форми", async () => {
    const { conn, executed } = fakeConnection({
      'weird"; DROP TABLE users; --': ["user_id"],
      routine_entries: ["user_id"],
    });

    await pruneForeignPartitionRows(conn, "user42");

    // Ім'я таблиці не можна передати параметром, тож воно потрапляє в SQL
    // текстом. Єдиний захист — біле поле символів, і саме його тут пін.
    expect(executed).toHaveLength(1);
    expect(executed[0]?.sql).toContain("routine_entries");
  });
});
