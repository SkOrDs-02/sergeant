/**
 * Нотатки до операцій між двома «пристроями» (аудит 2026-10-01, data-27).
 *
 * Кожен пристрій - окрема in-memory SQLite з реальними міграціями Фініка та
 * реальною чергою `sync_op_outbox`. Шлях даних той самий, що в проді, мінус
 * мережа: дуалрайт-адаптер пише рядок + оп в outbox -> оп «їде» на інший
 * пристрій як pull-оп -> `applyPullOp` -> `refreshFinykSqliteState` читає
 * нотатки в кеш. Серверну половину (LWW у SQL, soft-delete, межа довжини)
 * покриває `apps/server/.../applyTxNotes.test.ts` та інтеграційний тест синку.
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
import type { SyncV2PullOp } from "@sergeant/api-client";

import {
  __resetApplyPullOpCachesForTests,
  applyPullOp,
} from "../../../core/syncEngine/applyPullOp.js";
import { clearFinykSqliteCache, refreshFinykSqliteState } from "./sqliteReader";
import { applyFinykDualWriteOps } from "./sqliteWriter/adapter.js";
import type { FinykDualWriteOp } from "./sqliteWriter/diff.js";

// Схему outbox доводить окремий контракт; тут перевіряється шлях даних.
vi.mock("../../../core/syncEngine/outboxSchema.js", () => ({
  ensureOutboxSchema: async () => {},
}));

const USER = "user-notes";
const TX = "mono-tx-1";
const T1 = "2026-10-10T10:00:00.000Z";
const T2 = "2026-10-10T10:00:01.000Z";
const T3 = "2026-10-10T10:00:02.000Z";
const T4 = "2026-10-10T10:00:03.000Z";
const T5 = "2026-10-10T10:00:04.000Z";

interface Device {
  readonly id: string;
  readonly db: BetterSqliteDatabase;
  readonly client: SqliteMigrationClient;
  /** Скільки оп-ів outbox уже «відправлено» (курсор простого вічного пушу). */
  sent: number;
}

function makeClient(db: BetterSqliteDatabase): SqliteMigrationClient {
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

async function makeDevice(id: string): Promise<Device> {
  const db = new Database(":memory:");
  const client = makeClient(db);
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
  return { id, db, client, sent: 0 };
}

const upsert = (note: string): FinykDualWriteOp => ({
  kind: "tx-note-upsert",
  entry: { transactionId: TX, note },
});
const remove: FinykDualWriteOp = { kind: "tx-note-delete", transactionId: TX };

async function write(
  device: Device,
  op: FinykDualWriteOp,
  clientTs: string,
): Promise<void> {
  const res = await applyFinykDualWriteOps(device.client, [op], {
    userId: USER,
    clientTs,
  });
  expect(res.errored).toBe(0);
}

/** Нові оп-и outbox пристрою -> pull-оп-и, які побачить інший пристрій. */
async function outgoing(device: Device): Promise<SyncV2PullOp[]> {
  const rows = await device.client.all<{
    id: number;
    table_name: string;
    op: "insert" | "update" | "delete";
    row: string;
    client_ts: string;
  }>(
    `SELECT id, table_name, op, row, client_ts FROM sync_op_outbox ORDER BY id`,
  );
  const fresh = rows.slice(device.sent);
  device.sent = rows.length;
  return fresh.map((r) => ({
    id: r.id,
    table: r.table_name,
    op: r.op,
    row: JSON.parse(r.row) as Record<string, unknown>,
    client_ts: r.client_ts,
    server_ts: r.client_ts,
    origin_device_id: device.id,
  })) as SyncV2PullOp[];
}

async function deliver(
  ops: readonly SyncV2PullOp[],
  to: Device,
): Promise<string[]> {
  const outcomes: string[] = [];
  for (const op of ops) {
    outcomes.push(await applyPullOp(to.client, op, USER, to.id));
  }
  return outcomes;
}

async function notesOf(
  device: Device,
): Promise<Record<string, string | undefined>> {
  clearFinykSqliteCache();
  const cache = await refreshFinykSqliteState(device.client, USER);
  return cache.txNotes;
}

let a: Device;
let b: Device;

beforeEach(async () => {
  __resetApplyPullOpCachesForTests();
  a = await makeDevice("device-a");
  b = await makeDevice("device-b");
});

afterEach(() => {
  a.db.close();
  b.db.close();
  clearFinykSqliteCache();
});

describe("нотатки до операцій: синк між двома пристроями", () => {
  it("нотатка з A доїздить на B через outbox -> pull і читається в кеш", async () => {
    await write(a, upsert("оренда"), T1);

    const ops = await outgoing(a);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      table: "finyk_tx_notes",
      op: "insert",
      row: { user_id: USER, transaction_id: TX, note: "оренда" },
    });

    expect(await deliver(ops, b)).toEqual(["applied"]);
    expect(await notesOf(b)).toEqual({ [TX]: "оренда" });
    // Власний оп пристрій не застосовує вдруге (origin_device_id).
    expect(await deliver(ops, a)).toEqual(["skipped"]);
  });

  it("LWW: конкурентні правки сходяться до новішої на обох пристроях", async () => {
    await write(a, upsert("спільна"), T1);
    await deliver(await outgoing(a), b);

    // Обидва офлайн правлять одну нотатку; B - пізніше.
    await write(a, upsert("версія A"), T2);
    await write(b, upsert("версія B"), T4);
    const fromA = await outgoing(a);
    const fromB = await outgoing(b);

    // A отримує новішу B -> приймає; B отримує старішу A -> відсіює.
    expect(await deliver(fromB.slice(-1), a)).toEqual(["applied"]);
    expect(await deliver(fromA.slice(-1), b)).toEqual(["skipped"]);

    expect(await notesOf(a)).toEqual({ [TX]: "версія B" });
    expect(await notesOf(b)).toEqual({ [TX]: "версія B" });
  });

  it("порожня нотатка = soft-delete: рядок лишається tombstone-ом, кеш чистий", async () => {
    await write(a, upsert("тимчасова"), T1);
    await deliver(await outgoing(a), b);

    await write(a, remove, T2);
    const del = await outgoing(a);
    expect(del.at(-1)).toMatchObject({ table: "finyk_tx_notes", op: "delete" });
    expect(await deliver(del, b)).toEqual(["applied"]);

    expect(await notesOf(a)).toEqual({});
    expect(await notesOf(b)).toEqual({});
    const rows = await b.client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM finyk_tx_notes WHERE user_id = ? AND transaction_id = ?`,
      [USER, TX],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.deleted_at).not.toBeNull();
  });

  it("запис новіший за видалення воскрешає нотатку на іншому пристрої", async () => {
    await write(a, upsert("перша"), T1);
    await deliver(await outgoing(a), b);
    await write(a, remove, T2);
    await deliver(await outgoing(a), b);

    await write(b, upsert("друга"), T5);
    expect(await deliver(await outgoing(b), a)).toEqual(["applied"]);

    expect(await notesOf(a)).toEqual({ [TX]: "друга" });
    const rows = await a.client.all<{ deleted_at: string | null }>(
      `SELECT deleted_at FROM finyk_tx_notes WHERE user_id = ?`,
      [USER],
    );
    expect(rows[0]!.deleted_at).toBeNull();
  });

  it("запізніле видалення (старіше за правку) нотатку не стирає", async () => {
    await write(a, upsert("жива"), T3);
    // Видалення з іншого пристрою зроблене ДО цієї правки.
    const staleDelete: SyncV2PullOp = {
      id: 99,
      table: "finyk_tx_notes",
      op: "delete",
      row: { user_id: USER, transaction_id: TX },
      client_ts: T1,
      server_ts: T1,
      origin_device_id: b.id,
    } as SyncV2PullOp;
    expect(await deliver([staleDelete], a)).toEqual(["skipped"]);
    expect(await notesOf(a)).toEqual({ [TX]: "жива" });
  });
});
