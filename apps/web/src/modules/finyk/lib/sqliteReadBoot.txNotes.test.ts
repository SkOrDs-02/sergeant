/**
 * Інтеграційна перевірка нотаток через СПРАВЖНІЙ вхід `bootFinykSqliteReadPath`
 * (аудит 2026-10-01, `data-27`): без виклику кроків нотаток у бут-шляху
 *  - нотатка з LS (#1469) не потрапляє ні в SQLite, ні в outbox і не доїжджає
 *    до інших пристроїв;
 *  - нотатка, відхилена старим сервером у вікні деплою, лишається `rejected`
 *    назавжди.
 * Реальні модулі: `bootFinykSqliteReadPath`, `runTxNotesImportStep`, `runTxNotesRequeueStep`,
 * перелиття LS, перепостановка, `migrateFinyk`, ридер SQLite, outbox. Мокається
 * лише одиночка sqlite-wasm (`getSqliteDb` віддає in-memory better-sqlite3) і
 * DDL outbox (його створює справжній boot застосунку).
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import {
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
  drainSyncOpOutbox,
  markOutboxRejected,
} from "@sergeant/db-schema/sqlite";

import {
  __resetFinykSqliteReadBootForTests,
  bootFinykSqliteReadPath,
} from "./sqliteReadBoot";
import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
} from "./sqliteReader";
import { applyFinykDualWriteOps } from "./sqliteWriter/adapter.js";

let db: BetterSqliteDatabase;
let client: SqliteMigrationClient;

vi.mock("../../../core/syncEngine/outboxSchema.js", () => ({
  ensureOutboxSchema: async () => {},
}));
vi.mock("../../../core/db/sqlite.js", () => ({
  getSqliteDb: async () => ({ migrationClient: () => client }),
}));

const USER = "user-boot";
const LS_KEY = "finyk_tx_notes";
const T0 = "2026-10-10T10:00:00.000Z";

const outbox = () =>
  client.all<{ status: string; reject_reason: string | null }>(
    `SELECT status, reject_reason FROM sync_op_outbox WHERE table_name = 'finyk_tx_notes' ORDER BY id`,
  );

beforeEach(async () => {
  localStorage.clear();
  __resetFinykSqliteReadBootForTests();
  clearFinykSqliteCache();
  db = new Database(":memory:");
  client = {
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
  // Outbox живе в routine-міграціях; Фінікові накочує сам бут.
  await runMigrations({
    adapter: createSqliteAdapter(client),
    files: ROUTINE_CLIENT_MIGRATIONS,
    tableName: ROUTINE_MIGRATIONS_TABLE,
  });
});

afterEach(() => {
  db.close();
  clearFinykSqliteCache();
  __resetFinykSqliteReadBootForTests();
  localStorage.clear();
});

describe("bootFinykSqliteReadPath: нотатки до операцій", () => {
  it("нотатка з LS переливається в SQLite, потрапляє в outbox і видна в першому кеші", async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ "tx-ls": "з LS" }));

    expect(await bootFinykSqliteReadPath(USER)).toBe(true);

    expect(getCachedFinykSqliteState().txNotes).toEqual({ "tx-ls": "з LS" });
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect((await outbox()).map((r) => r.status)).toEqual(["pending"]);
  });

  it("нотатка, відхилена старим сервером (table_not_allowed), повертається в чергу після буту", async () => {
    // Перший бут створює таблиці Фініка (повторний бут імітує наступний старт).
    await bootFinykSqliteReadPath(USER);
    await applyFinykDualWriteOps(
      client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-new", note: "свіжа" },
        },
      ],
      { userId: USER, clientTs: T0 },
    );
    const drained = await drainSyncOpOutbox(client, {
      userId: USER,
      limit: 10,
      now: new Date(),
    });
    expect(drained.length).toBeGreaterThan(0);
    for (const row of drained) {
      await markOutboxRejected(client, row.id, "table_not_allowed");
    }
    expect((await outbox()).every((r) => r.status === "rejected")).toBe(true);

    __resetFinykSqliteReadBootForTests();
    clearFinykSqliteCache();
    expect(await bootFinykSqliteReadPath(USER)).toBe(true);

    // Перепостановка не блокує бут (див. застереження в `txNotesBoot.ts`), тож
    // чекаємо її результат, а не припускаємо, що вона вже відпрацювала.
    await vi.waitFor(async () => {
      const rows = await outbox();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.status === "pending")).toBe(true);
    });
    expect(getCachedFinykSqliteState().txNotes).toEqual({ "tx-new": "свіжа" });
  });
});
