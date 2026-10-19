/**
 * Фронт викочується раніше за бекенд (AGENTS.md § Deployment): нотатки, які
 * старий сервер відхилив як `table_not_allowed`, мусять доїхати після деплою
 * бекенду (аудит 2026-10-01, `data-27`).
 *
 * Реальні модулі: SQLite з міграціями Фініка, дуалрайт-адаптер, перелиття LS,
 * справжні `drainSyncOpOutbox`/`markOutbox*`/`runSyncEnginePushOnce`. Мокається
 * лише мережа: «сервер» — функція `push`, яка знає реєстр таблиць, веде
 * журнал `idempotency_key` (відхилений оп теж лежить у `sync_op_log`, тож
 * повтор ключа дає `duplicate`) і віддає pull-оп-и «другому пристрою».
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
  drainSyncOpOutbox,
  markOutboxRejected,
  markOutboxRetry,
  markOutboxSuccess,
  planRetry,
} from "@sergeant/db-schema/sqlite";
import {
  runSyncEnginePushOnce,
  type SyncV2OpResult,
  type SyncV2PullOp,
  type SyncV2PushOp,
} from "@sergeant/api-client";

import {
  __resetApplyPullOpCachesForTests,
  applyPullOp,
} from "../../../core/syncEngine/applyPullOp.js";
import { clearFinykSqliteCache, refreshFinykSqliteState } from "./sqliteReader";
import { applyFinykDualWriteOps } from "./sqliteWriter/adapter.js";
import { importLegacyTxNotesFromLs } from "./txNotesLsImport";
import { requeueTxNotesRejectedByOldServer } from "./txNotesOutboxRecovery";

vi.mock("../../../core/syncEngine/outboxSchema.js", () => ({
  ensureOutboxSchema: async () => {},
}));

const USER = "user-deploy-window";
const LS_KEY = "finyk_tx_notes";
const T0 = "2026-10-10T10:00:00.000Z";
const T1 = "2026-10-10T10:05:00.000Z";
const T2 = "2026-10-10T10:10:00.000Z";

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

async function makeDevice(): Promise<{
  db: BetterSqliteDatabase;
  client: SqliteMigrationClient;
}> {
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
  return { db, client };
}

/** Мінімальний сервер sync v2: реєстр таблиць + журнал ключів + pull-журнал. */
class FakeServer {
  supportsTxNotes = false;
  /** Незалежна від реєстру відмова (як `text_too_long` із застосувача). */
  forcedReject = new Map<string, string>();
  readonly journal = new Map<string, SyncV2OpResult>();
  readonly applied: SyncV2PullOp[] = [];
  private nextId = 1;

  readonly push = async (ops: SyncV2PushOp[]) => {
    const results: SyncV2OpResult[] = [];
    for (const op of ops) {
      const known = this.journal.get(op.idempotency_key);
      if (known) {
        results.push({
          idempotency_key: op.idempotency_key,
          status: "duplicate",
          ...(known.status === "rejected" && known.reason
            ? { reason: known.reason }
            : {}),
        } as SyncV2OpResult);
        continue;
      }
      let result: SyncV2OpResult;
      const forced = this.forcedReject.get(String(op.row["transaction_id"]));
      if (op.table !== "finyk_tx_notes" || this.supportsTxNotes) {
        result = forced
          ? ({
              idempotency_key: op.idempotency_key,
              status: "rejected",
              reason: forced,
            } as SyncV2OpResult)
          : ({
              idempotency_key: op.idempotency_key,
              status: "applied",
            } as SyncV2OpResult);
      } else {
        result = {
          idempotency_key: op.idempotency_key,
          status: "rejected",
          reason: "table_not_allowed",
        } as SyncV2OpResult;
      }
      this.journal.set(op.idempotency_key, result);
      if (result.status === "applied") {
        const id = this.nextId++;
        this.applied.push({
          id,
          table: op.table,
          op: op.op,
          row: op.row,
          client_ts: op.client_ts,
          server_ts: op.client_ts,
          origin_device_id: "device-a",
        } as SyncV2PullOp);
      }
      results.push(result);
    }
    return { accepted: results.length, last_op_id: this.nextId - 1, results };
  };
}

async function pushTick(
  client: SqliteMigrationClient,
  server: FakeServer,
): Promise<void> {
  await runSyncEnginePushOnce(
    {
      drain: (options) =>
        drainSyncOpOutbox(client, { ...options, userId: USER }),
      push: server.push,
      markSuccess: (id) => markOutboxSuccess(client, id),
      markRetry: (id, plan) => markOutboxRetry(client, id, plan),
      markRejected: (id, reason) => markOutboxRejected(client, id, reason),
      planRetry,
      now: () => new Date(),
    },
    { limit: 100 },
  );
}

const outboxRows = (client: SqliteMigrationClient) =>
  client.all<{ status: string; reject_reason: string | null; op: string }>(
    `SELECT status, reject_reason, op FROM sync_op_outbox ORDER BY id`,
  );

async function notesOn(
  client: SqliteMigrationClient,
): Promise<Record<string, string | undefined>> {
  clearFinykSqliteCache();
  return (await refreshFinykSqliteState(client, USER)).txNotes;
}

let a: Awaited<ReturnType<typeof makeDevice>>;
let b: Awaited<ReturnType<typeof makeDevice>>;
let server: FakeServer;

beforeEach(async () => {
  __resetApplyPullOpCachesForTests();
  localStorage.clear();
  a = await makeDevice();
  b = await makeDevice();
  server = new FakeServer();
});

afterEach(() => {
  a.db.close();
  b.db.close();
  clearFinykSqliteCache();
  localStorage.clear();
});

describe("нотатки в вікні «фронт уже новий, бекенд ще старий»", () => {
  it("відхилені table_not_allowed нотатки доїжджають на інший пристрій після деплою бекенду", async () => {
    // Нотатка з #1469 лежить у LS; новий бут переливає її в SQLite/outbox.
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ "tx-ls": "з локального сховища" }),
    );
    await importLegacyTxNotesFromLs(a.client, USER, T0);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    // Нова нотатка й видалення вже в вікні розкладки.
    await applyFinykDualWriteOps(
      a.client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-new", note: "свіжа" },
        },
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-gone", note: "зникне" },
        },
      ],
      { userId: USER, clientTs: T1 },
    );
    await applyFinykDualWriteOps(
      a.client,
      [{ kind: "tx-note-delete", transactionId: "tx-gone" }],
      { userId: USER, clientTs: T2 },
    );

    // Старий сервер: усе відхилено термінально.
    await pushTick(a.client, server);
    const afterOld = await outboxRows(a.client);
    expect(afterOld.length).toBeGreaterThan(0);
    expect(
      afterOld.every(
        (r) =>
          r.status === "rejected" && r.reject_reason === "table_not_allowed",
      ),
    ).toBe(true);
    expect(server.applied).toHaveLength(0);

    // Сервер задеплоєно; повтор ТИХ САМИХ ключів нічого б не дав (duplicate),
    // тож бут перепоставляє оп-и з поточного стану рядків.
    server.supportsTxNotes = true;
    const recovery = await requeueTxNotesRejectedByOldServer(a.client, USER);
    expect(recovery.remaining).toBe(0);
    expect(recovery.requeued).toBeGreaterThan(0);
    expect(
      (await outboxRows(a.client)).every((r) => r.status === "pending"),
    ).toBe(true);

    await pushTick(a.client, server);
    expect(await outboxRows(a.client)).toEqual([]);

    // Інший пристрій отримує pull-оп-и й бачить нотатки; видалена - ні.
    for (const op of server.applied) {
      await applyPullOp(b.client, op, USER, "device-b");
    }
    expect(await notesOn(b.client)).toEqual({
      "tx-ls": "з локального сховища",
      "tx-new": "свіжа",
    });
    // Tombstone поїхав delete-оп-ом зі СВОЇМ часом (LWW не зсунуто).
    const del = server.applied.find((o) => o.op === "delete");
    expect(del?.row).toMatchObject({ transaction_id: "tx-gone" });
    expect(del?.client_ts).toBe(T2);
  });

  it("якщо бекенд досі старий, відхилені рядки не накопичуються між бутами", async () => {
    await applyFinykDualWriteOps(
      a.client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-1", note: "одна" },
        },
      ],
      { userId: USER, clientTs: T0 },
    );
    await pushTick(a.client, server);

    for (let boot = 0; boot < 3; boot++) {
      await requeueTxNotesRejectedByOldServer(a.client, USER);
      await pushTick(a.client, server);
    }
    const rows = await outboxRows(a.client);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "rejected",
      reject_reason: "table_not_allowed",
    });
  });

  it("справжні відмови (text_too_long) не перепоставляються й не зникають", async () => {
    server.supportsTxNotes = true;
    server.forcedReject.set("tx-long", "text_too_long");
    await applyFinykDualWriteOps(
      a.client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-long", note: "задовга" },
        },
      ],
      { userId: USER, clientTs: T0 },
    );
    await pushTick(a.client, server);

    const result = await requeueTxNotesRejectedByOldServer(a.client, USER);
    expect(result).toEqual({ requeued: 0, remaining: 0 });
    expect(await outboxRows(a.client)).toEqual([
      expect.objectContaining({
        status: "rejected",
        reject_reason: "text_too_long",
      }),
    ]);
  });

  it("не чіпає відхилені рядки інших таблиць і чужих користувачів", async () => {
    await a.client.run(
      `INSERT INTO sync_op_outbox
         (user_id, table_name, op, row, client_ts, idempotency_key, status, reject_reason)
       VALUES (?, ?, 'insert', '{}', ?, 'k-other-table', 'rejected', 'table_not_allowed'),
              (?, 'finyk_tx_notes', 'insert', '{"transaction_id":"x"}', ?, 'k-other-user', 'rejected', 'table_not_allowed')`,
      [USER, "some_other_table", T0, "someone-else", T0],
    );
    const result = await requeueTxNotesRejectedByOldServer(a.client, USER);
    expect(result).toEqual({ requeued: 0, remaining: 0 });
    expect(await outboxRows(a.client)).toHaveLength(2);
  });

  it("оп перепостановки має той самий вигляд, що й оп адаптера (payload не розходиться)", async () => {
    await applyFinykDualWriteOps(
      a.client,
      [
        {
          kind: "tx-note-upsert",
          entry: { transactionId: "tx-1", note: "текст" },
        },
      ],
      { userId: USER, clientTs: T0 },
    );
    const original = await a.client.all<{ row: string; op: string }>(
      `SELECT row, op FROM sync_op_outbox`,
    );
    await pushTick(a.client, server); // старий сервер -> rejected
    await requeueTxNotesRejectedByOldServer(a.client, USER);
    const requeued = await a.client.all<{ row: string; op: string }>(
      `SELECT row, op FROM sync_op_outbox WHERE status = 'pending'`,
    );
    expect(requeued).toEqual(original);
  });
});
