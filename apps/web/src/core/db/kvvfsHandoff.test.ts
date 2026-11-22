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
  canRemoveKvvfsStore,
  hasKvvfsData,
  isAnotherAccountHandoffDone,
  isHandoffDone,
  markHandoffDone,
  pruneForeignPartitionRows,
  removeKvvfsStore,
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

    const pruned = await pruneForeignPartitionRows(conn, "user42", {
      keepKvStore: true,
    });

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

  it("скидає курсори pull, бо в них немає user_id", async () => {
    const { conn, executed } = fakeConnection({
      routine_entries: ["id", "user_id"],
      sync_op_cursor: ["key", "value_int", "updated_at"],
    });

    await pruneForeignPartitionRows(conn, "user42", { keepKvStore: true });

    expect(executed.map((e) => e.sql)).toContain("DELETE FROM sync_op_cursor");
  });

  it("на анонімній партиції лишає саме синтетичні id", async () => {
    const { conn, executed } = fakeConnection({
      routine_entries: ["id", "user_id"],
    });

    await pruneForeignPartitionRows(conn, null, { keepKvStore: true });

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

    await pruneForeignPartitionRows(conn, "user42", { keepKvStore: true });

    // Ім'я таблиці не можна передати параметром, тож воно потрапляє в SQL
    // текстом. Єдиний захист — біле поле символів, і саме його тут пін.
    expect(executed).toHaveLength(1);
    expect(executed[0]?.sql).toContain("routine_entries");
  });
});

describe("kv_store зі знімка (priv-17)", () => {
  it("лишається першому акаунту і вирізається для решти", async () => {
    const tables = {
      routine_entries: ["id", "user_id"],
      kv_store: ["key", "value", "updated_at"],
    };
    const first = fakeConnection(tables);
    await pruneForeignPartitionRows(first.conn, "user42", {
      keepKvStore: true,
    });
    expect(first.executed.map((e) => e.sql)).not.toContain(
      "DELETE FROM kv_store",
    );

    // Наступний акаунт не успадковує чужих налаштувань (зокрема біометрії),
    // які інакше поїхали б write-through на сервер уже під його id.
    const next = fakeConnection(tables);
    await pruneForeignPartitionRows(next.conn, "user99", {
      keepKvStore: false,
    });
    expect(next.executed.map((e) => e.sql)).toContain("DELETE FROM kv_store");
  });

  it("«перший акаунт» не рахує ні себе, ні анонімну партицію", () => {
    markHandoffDone("anon");
    markHandoffDone("user42");

    expect(isAnotherAccountHandoffDone("user42", "anon")).toBe(false);
    expect(isAnotherAccountHandoffDone("user99", "anon")).toBe(true);
  });
});

describe("стадія 3: чи можна стерти старе сховище", () => {
  const allDone = {
    anonHandedOff: true,
    isAccountHandedOff: () => true,
    kvStoreDelivered: true,
  };

  it("порожня черга і всі партиції перелиті: можна", () => {
    expect(
      canRemoveKvvfsStore(
        { userIds: ["user42", "user99"], outboxRows: 0, kvStoreRows: 0 },
        { ...allDone, anonHandedOff: false },
      ),
    ).toBe(true);
  });

  it("недоставлене в черзі знімка: не можна", () => {
    expect(
      canRemoveKvvfsStore(
        { userIds: ["user42"], outboxRows: 3, kvStoreRows: 0 },
        allDone,
      ),
    ).toBe(false);
  });

  it("анонімні рядки чекають перелиття своєї партиції", () => {
    const census = {
      userIds: ["local-anon", "user42"],
      outboxRows: 0,
      kvStoreRows: 0,
    };
    expect(
      canRemoveKvvfsStore(census, { ...allDone, anonHandedOff: false }),
    ).toBe(false);
    expect(canRemoveKvvfsStore(census, allDone)).toBe(true);
  });

  it("акаунт зі знімка без власної позначки: не можна, навіть після анонімної", () => {
    const census = {
      userIds: ["local-anon", "user42", "user99"],
      outboxRows: 0,
      kvStoreRows: 0,
    };
    const progress = {
      ...allDone,
      isAccountHandedOff: (id: string) => id === "user42",
    };
    expect(canRemoveKvvfsStore(census, progress)).toBe(false);
    expect(
      canRemoveKvvfsStore(census, {
        ...progress,
        isAccountHandedOff: () => true,
      }),
    ).toBe(true);
  });

  it("непорожній kv_store чекає першого акаунта", () => {
    const census = { userIds: ["local-anon"], outboxRows: 0, kvStoreRows: 5 };
    expect(
      canRemoveKvvfsStore(census, { ...allDone, kvStoreDelivered: false }),
    ).toBe(false);
    expect(canRemoveKvvfsStore(census, allDone)).toBe(true);
  });
});

describe("removeKvvfsStore", () => {
  it("стирає всі kvvfs-local-* і нічого іншого", () => {
    localStorage.setItem("kvvfs-local-sz", "8192");
    localStorage.setItem("kvvfs-local-jrnl", "j");
    localStorage.setItem("kvvfs-local-1", "p1");
    localStorage.setItem("kvvfs-local-2", "p2");
    localStorage.setItem("sergeant.storage.opfsHandoff.v1.anon", "done");

    expect(hasKvvfsData()).toBe(true);
    expect(removeKvvfsStore()).toBe(4);

    expect(hasKvvfsData()).toBe(false);
    expect(
      Object.keys(localStorage).filter((k) => k.startsWith("kvvfs-local-")),
    ).toEqual([]);
    // Позначки перелиття мусять пережити стирання: без них наступний
    // старт вважав би партицію неперелитою.
    expect(isHandoffDone("anon")).toBe(true);
  });
});
