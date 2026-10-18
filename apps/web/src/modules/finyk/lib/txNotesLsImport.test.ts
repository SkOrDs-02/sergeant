/**
 * Одноразове перелиття LS-нотаток у SQLite/outbox (аудит 2026-10-01, data-27).
 * Реальний in-memory SQLite з міграціями Фініка й живою чергою outbox.
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
  FINYK_CLIENT_MIGRATIONS,
  FINYK_MIGRATIONS_TABLE,
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";

import { clearFinykSqliteCache, refreshFinykSqliteState } from "./sqliteReader";
import {
  importLegacyTxNotesFromLs,
  LEGACY_LS_IMPORT_CLIENT_TS,
} from "./txNotesLsImport";
import { applyPullOp } from "../../../core/syncEngine/applyPullOp";

vi.mock("../../../core/syncEngine/outboxSchema.js", () => ({
  ensureOutboxSchema: async () => {},
}));

const USER = "user-import";
const TS = "2026-10-10T10:00:00.000Z";
const LATER = "2026-10-10T11:00:00.000Z";
const LS_KEY = "finyk_tx_notes";

let db: BetterSqliteDatabase;
let client: SqliteMigrationClient;
/** `tx-bad` падає на запису: імітація збою SQLite посеред перелиття. */
let failOnTx: string | null = null;
/** Збій постановки в outbox (SQLite-запис нотатки при цьому проходить). */
let failOnOutbox = false;

beforeEach(async () => {
  failOnTx = null;
  failOnOutbox = false;
  localStorage.clear();
  db = new Database(":memory:");
  client = {
    exec(sql) {
      db.exec(sql);
    },
    run(sql, params) {
      if (
        failOnTx !== null &&
        /INSERT INTO finyk_tx_notes/.test(sql) &&
        (params ?? []).includes(failOnTx)
      ) {
        throw new Error("disk full");
      }
      if (failOnOutbox && /INTO sync_op_outbox/.test(sql)) {
        throw new Error("outbox busy");
      }
      db.prepare(sql).run(...((params ?? []) as unknown[]));
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      return (
        params ? stmt.all(...(params as unknown[])) : stmt.all()
      ) as never;
    },
  };
  for (const [files, tableName] of [
    [ROUTINE_CLIENT_MIGRATIONS, ROUTINE_MIGRATIONS_TABLE],
    [FINYK_CLIENT_MIGRATIONS, FINYK_MIGRATIONS_TABLE],
  ] as const) {
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files,
      tableName,
    });
  }
});

afterEach(() => {
  db.close();
  clearFinykSqliteCache();
  localStorage.clear();
});

const setLs = (value: unknown) =>
  localStorage.setItem(LS_KEY, JSON.stringify(value));

const outbox = () =>
  client.all<{ table_name: string; op: string; row: string }>(
    `SELECT table_name, op, row FROM sync_op_outbox ORDER BY id`,
  );

describe("importLegacyTxNotesFromLs", () => {
  it("переливає LS-нотатки в SQLite + outbox, знімає ключ, кеш їх бачить", async () => {
    setLs({ "tx-1": "оренда", "tx-2": "  кава  " });

    const res = await importLegacyTxNotesFromLs(client, USER, TS);

    expect(res).toEqual({ imported: 2, drained: true });
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    const cache = await refreshFinykSqliteState(client, USER);
    expect(cache.txNotes).toEqual({ "tx-1": "оренда", "tx-2": "кава" });

    const queued = await outbox();
    expect(queued.map((r) => [r.table_name, r.op])).toEqual([
      ["finyk_tx_notes", "insert"],
      ["finyk_tx_notes", "insert"],
    ]);
    expect(JSON.parse(queued[0]!.row)).toEqual({
      user_id: USER,
      transaction_id: "tx-1",
      note: "оренда",
    });
  });

  it("ідемпотентне: повторний запуск нічого не пише вдруге", async () => {
    setLs({ "tx-1": "оренда" });
    await importLegacyTxNotesFromLs(client, USER, TS);

    // Навіть якщо ключ повернувся (напр. replace-бекап), рядок уже в таблиці.
    setLs({ "tx-1": "оренда" });
    const again = await importLegacyTxNotesFromLs(client, USER, LATER);

    expect(again).toEqual({ imported: 0, drained: true });
    expect(await outbox()).toHaveLength(1);
  });

  it("не перезаписує наявну нотатку SQLite і не воскрешає tombstone", async () => {
    // tx-1: свіжіша нотатка вже в SQLite (приїхала pull-ом); tx-2: видалена.
    await client.run(
      `INSERT INTO finyk_tx_notes
         (user_id, transaction_id, note, created_at, updated_at, deleted_at)
       VALUES (?, 'tx-1', 'свіжа з сервера', ?, ?, NULL),
              (?, 'tx-2', 'видалена', ?, ?, ?)`,
      [USER, LATER, LATER, USER, LATER, LATER, LATER],
    );
    setLs({ "tx-1": "стара з LS", "tx-2": "стара з LS", "tx-3": "нова" });

    const res = await importLegacyTxNotesFromLs(client, USER, TS);

    expect(res).toEqual({ imported: 1, drained: true });
    const cache = await refreshFinykSqliteState(client, USER);
    expect(cache.txNotes).toEqual({
      "tx-1": "свіжа з сервера",
      "tx-3": "нова",
    });
  });

  it("відсіює сміття й обрізає понад NOTE_MAX_LEN (сервер відхилив би термінально)", async () => {
    setLs({
      "tx-ok": "ok",
      "tx-blank": "   ",
      "tx-num": 5,
      "tx-long": "я".repeat(1500),
    });

    await importLegacyTxNotesFromLs(client, USER, TS);

    const cache = await refreshFinykSqliteState(client, USER);
    expect(Object.keys(cache.txNotes).sort()).toEqual(["tx-long", "tx-ok"]);
    expect(cache.txNotes["tx-long"]).toHaveLength(1000);
  });

  it("збій запису лишає LS-ключ, а повтор дописує решту без дублів", async () => {
    setLs({ "tx-1": "перша", "tx-bad": "друга" });
    failOnTx = "tx-bad";

    const first = await importLegacyTxNotesFromLs(client, USER, TS);

    expect(first).toEqual({ imported: 1, drained: false });
    expect(localStorage.getItem(LS_KEY)).not.toBeNull();

    failOnTx = null;
    const second = await importLegacyTxNotesFromLs(client, USER, LATER);

    expect(second).toEqual({ imported: 1, drained: true });
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    const cache = await refreshFinykSqliteState(client, USER);
    expect(cache.txNotes).toEqual({ "tx-1": "перша", "tx-bad": "друга" });
    expect(await outbox()).toHaveLength(2);
  });

  it("збій постановки в outbox лишає LS-ключ, повтор ставить оп (рядок у SQLite уже є)", async () => {
    setLs({ "tx-1": "оренда" });
    failOnOutbox = true;

    const first = await importLegacyTxNotesFromLs(client, USER, TS);

    expect(first.drained).toBe(false);
    expect(localStorage.getItem(LS_KEY)).not.toBeNull();
    expect(await outbox()).toHaveLength(0);

    failOnOutbox = false;
    const second = await importLegacyTxNotesFromLs(client, USER, TS);

    expect(second.drained).toBe(true);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect((await outbox()).map((r) => r.op)).toEqual(["insert"]);
  });

  it("епоха: видалення з іншого пристрою після перелиття лишає tombstone", async () => {
    setLs({ "tx-1": "стара з LS" });
    await importLegacyTxNotesFromLs(client, USER, LEGACY_LS_IMPORT_CLIENT_TS);

    const outcome = await applyPullOp(
      client,
      {
        id: 10,
        table: "finyk_tx_notes",
        op: "delete",
        row: { user_id: USER, transaction_id: "tx-1" },
        client_ts: "2026-10-11T10:00:00.000Z",
        server_ts: "2026-10-11T10:00:00.000Z",
        origin_device_id: "device-A",
      } as never,
      USER,
      "device-B",
    );

    expect(outcome).toBe("applied");
    const cache = await refreshFinykSqliteState(client, USER);
    expect(cache.txNotes).toEqual({});
    const rows = await client.all<{ note: string; deleted_at: string | null }>(
      `SELECT note, deleted_at FROM finyk_tx_notes WHERE transaction_id = 'tx-1'`,
    );
    expect(rows[0]).toEqual({
      note: "",
      deleted_at: "2026-10-11T10:00:00.000Z",
    });
  });

  it("видалення з іншого пристрою ДО перелиття лишає tombstone, LS не воскресає", async () => {
    await applyPullOp(
      client,
      {
        id: 10,
        table: "finyk_tx_notes",
        op: "delete",
        row: { user_id: USER, transaction_id: "tx-1" },
        client_ts: "2026-10-11T10:00:00.000Z",
        server_ts: "2026-10-11T10:00:00.000Z",
        origin_device_id: "device-A",
      } as never,
      USER,
      "device-B",
    );
    setLs({ "tx-1": "стара з LS" });
    await importLegacyTxNotesFromLs(client, USER, LEGACY_LS_IMPORT_CLIENT_TS);

    const cache = await refreshFinykSqliteState(client, USER);
    expect(cache.txNotes).toEqual({});
    expect(await outbox()).toHaveLength(0);
  });

  it("без LS-ключа - нічого не робить", async () => {
    const res = await importLegacyTxNotesFromLs(client, USER, TS);
    expect(res).toEqual({ imported: 0, drained: true });
    expect(await outbox()).toHaveLength(0);
  });

  it("порожній LS-обʼєкт просто знімається", async () => {
    setLs({});
    const res = await importLegacyTxNotesFromLs(client, USER, TS);
    expect(res).toEqual({ imported: 0, drained: true });
    expect(localStorage.getItem(LS_KEY)).toBeNull();
  });
});
