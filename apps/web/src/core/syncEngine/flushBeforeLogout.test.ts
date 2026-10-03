/**
 * Регресія аудиту шару даних 2026-08-05 і аудиту 2026-10-01 (`data-19`).
 *
 * `logout()` викликає `wipeSqliteDb()` — повне видалення файлу локальної
 * БД разом із `sync_op_outbox`. Поки запис не доїхав до Postgres, локальна
 * копія єдина.
 *
 * Тут справжній SQLite (better-sqlite3), справжні db-schema-хелпери і справжній
 * writer-runtime; підроблено лише HTTP-`push` та "чий зараз сеанс" (`../db/sqlite`).
 * Кожен тест закриває один спосіб мовчазної втрати: рахувався лише `pending`
 * (а `dead_letter`/`rejected` стирались без питання), рядки в бекофі не
 * пробувались, дренувався лише один батч, а при `runtime === null` стан
 * вважався безпечним.
 */
import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSqliteAdapter,
  type SqliteMigrationClient,
} from "@sergeant/db-schema/migrate/sqlite";
import { runMigrations } from "@sergeant/db-schema/migrate/runner";
import {
  countOutboxByStatus,
  drainSyncOpOutbox,
  markOutboxRejected,
  markOutboxRetry,
  markOutboxSuccess,
  planRetry,
  recoverDeadLetter,
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import type { SyncV2PushOp, SyncV2PushResponse } from "@sergeant/api-client";

import { enqueueOutboxUpsert } from "./enqueueOutboxUpsert.js";
import { __resetOutboxNudgeForTests } from "./outboxNudge.js";
import {
  createSyncEngineWriterRuntime,
  type SyncEngineWriterRuntime,
} from "./syncEngineWriter.js";

const USER = "usr_real_better_auth_id";
const OTHER_USER = "usr_someone_else";

const sqliteState = vi.hoisted(() => ({
  userId: null as string | null,
  client: null as unknown,
}));
const runtimeState = vi.hoisted(() => ({
  runtime: null as unknown,
}));

vi.mock("./singleton", () => ({
  getSyncEngineWriter: () => runtimeState.runtime,
  BENIGN_REJECT_REASONS: new Set(["lww_conflict"]),
}));
vi.mock("../db/sqlite", () => ({
  readActiveSqliteUserId: () => sqliteState.userId,
  getSqliteDb: async () => ({
    migrationClient: () => sqliteState.client,
  }),
}));

import { flushPendingSyncOpsBeforeLogout } from "./flushBeforeLogout";

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

describe("flushPendingSyncOpsBeforeLogout", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;
  let pushCalls: SyncV2PushOp[][];
  let pushImpl: (ops: SyncV2PushOp[]) => Promise<SyncV2PushResponse>;

  const applyAll = async (
    ops: SyncV2PushOp[],
  ): Promise<SyncV2PushResponse> => ({
    accepted: ops.length,
    last_op_id: ops.length,
    results: ops.map((op) => ({
      idempotency_key: op.idempotency_key,
      status: "applied" as const,
    })),
  });

  function startRuntime(): SyncEngineWriterRuntime {
    const runtime = createSyncEngineWriterRuntime({
      pushDeps: {
        drain: async (options) =>
          drainSyncOpOutbox(client, { ...options, userId: USER }),
        push: async (ops) => {
          pushCalls.push(ops);
          return pushImpl(ops);
        },
        markSuccess: (id) => markOutboxSuccess(client, id),
        markRetry: (id, plan) => markOutboxRetry(client, id, plan),
        markRejected: (id, reason) => markOutboxRejected(client, id, reason),
        planRetry,
        now: () => new Date("2026-10-02T10:00:00.000Z"),
      },
      setInterval: (handler, ms) => setInterval(handler, ms),
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
      eventTarget: { addEventListener() {}, removeEventListener() {} },
      getStatus: () => countOutboxByStatus(client),
      recoverDeadLetter: (target) =>
        recoverDeadLetter(
          client,
          target.all === true
            ? { all: true, userId: USER }
            : { ids: target.ids, userId: USER },
        ),
      intervalMs: 30_000,
      limit: 100,
    });
    runtimeState.runtime = runtime;
    return runtime;
  }

  async function enqueue(key: string, userId = USER) {
    await enqueueOutboxUpsert(client, {
      userId,
      table: "finyk_budgets",
      op: "insert",
      row: { id: key, user_id: userId, data_json: "{}" },
      clientTs: "2026-10-02T09:59:00.000Z",
      idempotencyKey: key,
    });
  }

  function idOf(key: string): number {
    return (
      db
        .prepare(`SELECT id FROM sync_op_outbox WHERE idempotency_key = ?`)
        .get(key) as { id: number }
    ).id;
  }

  beforeEach(async () => {
    __resetOutboxNudgeForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
    sqliteState.userId = USER;
    sqliteState.client = client;
    runtimeState.runtime = null;
    pushCalls = [];
    pushImpl = applyAll;
  });

  afterEach(() => {
    __resetOutboxNudgeForTests();
    db.close();
  });

  it("is safe for the anonymous partition — there is no queue to deliver", async () => {
    sqliteState.userId = null;
    await expect(flushPendingSyncOpsBeforeLogout()).resolves.toEqual({
      pending: 0,
      unknown: false,
    });
    sqliteState.userId = "local-anon";
    await expect(flushPendingSyncOpsBeforeLogout()).resolves.toEqual({
      pending: 0,
      unknown: false,
    });
  });

  it("skips the network entirely when the queue is already empty", async () => {
    const runtime = startRuntime();
    const flushNow = vi.spyOn(runtime, "flushNow");

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 0, unknown: false });
    // Переважна більшість виходів — з порожньою чергою; вони не мають
    // платити ні запитом, ні затримкою.
    expect(flushNow).not.toHaveBeenCalled();
  });

  it("reads the outbox directly when the sync engine never started (runtime === null)", async () => {
    // Раніше `!runtime` → SAFE: бут упав, а в черзі лежить недоставлене.
    await enqueue("op-1");
    await enqueue("op-2");
    db.prepare(
      `UPDATE sync_op_outbox SET status = 'dead_letter' WHERE idempotency_key = 'op-2'`,
    ).run();

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 2, unknown: false });
  });

  it("delivers a plain queue and reports zero", async () => {
    startRuntime();
    await enqueue("op-1");
    await enqueue("op-2");

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 0, unknown: false });
    expect(pushCalls.flat()).toHaveLength(2);
  });

  it("delivers rows that are sitting in a retry backoff (next_retry_at in the future)", async () => {
    // `drain` бере лише due-рядки, тож без скидання бекофу вони не
    // пробувались, хоча мережа вже є — і зникали разом із файлом.
    startRuntime();
    await enqueue("op-backoff");
    await markOutboxRetry(client, idOf("op-backoff"), {
      attempts: 3,
      status: "pending",
      nextRetryAt: "2999-01-01T00:00:00.000Z",
      lastError: "http_503",
    });

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(pushCalls.flat().map((op) => op.idempotency_key)).toEqual([
      "op-backoff",
    ]);
    expect(result).toEqual({ pending: 0, unknown: false });
  });

  it("counts dead_letter rows and gives them one more delivery attempt", async () => {
    startRuntime();
    await enqueue("op-dead");
    db.prepare(
      `UPDATE sync_op_outbox SET status = 'dead_letter', attempts = 10 WHERE idempotency_key = 'op-dead'`,
    ).run();

    // Сервер лежить: рядок оживає, пуш падає, і він лишається в рахунку.
    pushImpl = async () => {
      throw new Error("http_503");
    };
    const failed = await flushPendingSyncOpsBeforeLogout();
    expect(failed).toEqual({ pending: 1, unknown: false });

    // Сервер піднявся: наступний вихід доставляє його, а не стирає.
    pushImpl = applyAll;
    db.prepare(`UPDATE sync_op_outbox SET next_retry_at = NULL`).run();
    const delivered = await flushPendingSyncOpsBeforeLogout();
    expect(delivered).toEqual({ pending: 0, unknown: false });
  });

  it("keeps draining batch after batch (flushNow pushes only 100 per call)", async () => {
    startRuntime();
    for (let i = 0; i < 250; i++) await enqueue(`op-${i}`);

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(pushCalls.length).toBeGreaterThanOrEqual(3);
    expect(pushCalls.flat()).toHaveLength(250);
    expect(result).toEqual({ pending: 0, unknown: false });
  });

  it("counts non-benign rejected rows but not lww_conflict", async () => {
    await enqueue("op-real");
    await enqueue("op-lww");
    await markOutboxRejected(client, idOf("op-real"), "user_id_mismatch");
    await markOutboxRejected(client, idOf("op-lww"), "lww_conflict");

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 1, unknown: false });
  });

  it("does not count another account's rows", async () => {
    await enqueue("op-theirs", OTHER_USER);

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 0, unknown: false });
  });

  it("reports what is STILL undelivered after the flush", async () => {
    // Саме цей сценарій піднімає діалог: доставити не вдалось, і рішення
    // «втрачати чи ні» переходить до людини.
    startRuntime();
    await enqueue("op-1");
    await enqueue("op-2");
    pushImpl = async () => {
      throw new Error("http_503");
    };

    const result = await flushPendingSyncOpsBeforeLogout();

    expect(result).toEqual({ pending: 2, unknown: false });
  });

  it("fails open when the outbox cannot be read — logout must never be blocked", async () => {
    sqliteState.client = {
      ...client,
      all: () => {
        throw new Error("sqlite gone");
      },
    };

    const result = await flushPendingSyncOpsBeforeLogout();

    // `unknown: true` → викликач НЕ показує діалог і випускає людину.
    expect(result).toEqual({ pending: 0, unknown: true });
  });

  it("stops at the deadline and reports what is left when the push hangs", async () => {
    startRuntime();
    await enqueue("op-1");
    pushImpl = () => new Promise(() => {});

    const result = await flushPendingSyncOpsBeforeLogout(30);

    expect(result).toEqual({ pending: 1, unknown: false });
  });
});
