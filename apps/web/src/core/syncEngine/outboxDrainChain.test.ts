/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Інтеграційне покриття ланцюга «локальний запис → HTTP-push».
 *
 * AI-CONTEXT: до цього файлу покриття синку обривалось на межі SQLite.
 * `syncRoundTrip.test.ts` доводить `enqueue → pull apply` (обидва боки —
 * локальні), а smoke-тест `deep-module-crud` перевіряє локальний стан.
 * Жоден із них не міг помітити, що черга не дренажиться: саме так
 * знахідка з `docs/90-work/tech-debt/frontend.md § Критичне` прожила
 * повний зелений прогін. Тут зібрано РЕАЛЬНИЙ продакшн-граф —
 * справжній SQLite, справжні `enqueueOutboxUpsert` / `drainSyncOpOutbox` /
 * lifecycle-хелпери, справжні scheduler і writer-runtime. Підроблений
 * лише HTTP-`push`.
 *
 * Кожен тест нижче має робити неможливим один конкретний спосіб мовчазної
 * втрати даних — а не просто «проходити».
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
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import type { SyncV2PushOp, SyncV2PushResponse } from "@sergeant/api-client";

import { enqueueOutboxUpsert } from "./enqueueOutboxUpsert.js";
import {
  __resetOutboxNudgeForTests,
  setOutboxEnqueueNudge,
} from "./outboxNudge.js";
import { createSyncEngineWriterRuntime } from "./syncEngineWriter.js";

const AUTHED_USER_ID = "usr_real_better_auth_id";
/** Синтетичний id анонімного відвідувача — `useLocalUserId.LOCAL_ANON_USER_ID`. */
const ANON_USER_ID = "local-anon";

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

/** Відповідь сервера, у якій кожна надіслана операція прийнята. */
function applyAll(ops: SyncV2PushOp[]): SyncV2PushResponse {
  return {
    accepted: ops.length,
    last_op_id: ops.length,
    results: ops.map((op) => ({
      idempotency_key: op.idempotency_key,
      status: "applied" as const,
    })),
  };
}

describe("sync v2: ланцюг «локальний запис → HTTP-push»", () => {
  let db: BetterSqliteDatabase;
  let client: SqliteMigrationClient;
  /** Кожен виклик — один HTTP-запит на `/api/v2/sync/push`. */
  let pushCalls: SyncV2PushOp[][];

  /** Скільки рядків узагалі лежить в аутбоксі, незалежно від статусу. */
  function rowCount(): number {
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM sync_op_outbox`).get() as {
        n: number;
      }
    ).n;
  }

  beforeEach(async () => {
    __resetOutboxNudgeForTests();
    db = new Database(":memory:");
    client = makeSqliteClient(db);
    pushCalls = [];
    await runMigrations({
      adapter: createSqliteAdapter(client),
      files: ROUTINE_CLIENT_MIGRATIONS,
      tableName: ROUTINE_MIGRATIONS_TABLE,
    });
  });

  afterEach(() => {
    __resetOutboxNudgeForTests();
    db.close();
  });

  /**
   * Збирає writer-runtime так само, як `createDefaultRuntime` у
   * `singleton.ts`: drain скоупиться живим `resolveUserId()`, лишні
   * залежності — справжні helper-и db-schema.
   */
  function makeRuntime(resolveUserId: () => Promise<string | null>) {
    return createSyncEngineWriterRuntime({
      pushDeps: {
        drain: async (options) => {
          const userId = await resolveUserId();
          if (!userId) return [];
          return drainSyncOpOutbox(client, { ...options, userId });
        },
        push: async (ops) => {
          pushCalls.push(ops);
          return applyAll(ops);
        },
        markSuccess: (id) => markOutboxSuccess(client, id),
        markRetry: (id, plan) => markOutboxRetry(client, id, plan),
        markRejected: (id, reason) => markOutboxRejected(client, id, reason),
        planRetry,
        now: () => new Date("2026-07-25T10:00:00.000Z"),
      },
      setInterval: (handler, ms) => setInterval(handler, ms),
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
      eventTarget: { addEventListener() {}, removeEventListener() {} },
      getStatus: () => countOutboxByStatus(client),
      recoverDeadLetter: () => Promise.resolve({ recovered: [], skipped: [] }),
      intervalMs: 30_000,
      limit: 100,
    });
  }

  async function enqueueFinykOp(userId: string, idempotencyKey: string) {
    await enqueueOutboxUpsert(client, {
      userId,
      table: "finyk_budgets",
      op: "insert",
      row: { id: idempotencyKey, user_id: userId, data_json: "{}" },
      clientTs: "2026-07-25T09:59:00.000Z",
      idempotencyKey,
    });
  }

  it("автентифікований запис доїжджає до HTTP-push і зникає з черги", async () => {
    // Робить неможливим: «локальний запис зроблено, черга не порожня, у
    // мережу не пішло нічого» — саме той симптом, що прожив зелений E2E.
    const runtime = makeRuntime(() => Promise.resolve(AUTHED_USER_ID));
    await enqueueFinykOp(AUTHED_USER_ID, "op-authed-1");

    expect((await countOutboxByStatus(client)).pending).toBe(1);

    await runtime.flushNow();

    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]).toHaveLength(1);
    expect(pushCalls[0]![0]!.table).toBe("finyk_budgets");
    expect((await countOutboxByStatus(client)).pending).toBe(0);
  });

  it("операція під синтетичним анонімним id взагалі не потрапляє в чергу", async () => {
    // Корінь знахідки: `useLocalUserId()` віддає `'local-anon'` до
    // логіну, дуал-райт клав рядок під цим id, а `drainSyncOpOutbox`
    // фільтрує по id сесії Better Auth. Збігу нема ніколи, а TTL-збирач
    // `pending` не чіпає за контрактом (`purgeStaleTerminalOutbox` кидає
    // на статус 'pending') — рядок жив у черзі вічно.
    //
    // Асерт робить неможливим повернення до стану, де в `sync_op_outbox`
    // лежить хоч один рядок, який ніхто не може ні надіслати, ні прибрати.
    const result = await enqueueOutboxUpsert(client, {
      userId: ANON_USER_ID,
      table: "finyk_budgets",
      op: "insert",
      row: { id: "op-anon-1", user_id: ANON_USER_ID, data_json: "{}" },
      clientTs: "2026-07-25T09:59:00.000Z",
      idempotencyKey: "op-anon-1",
    });

    expect(result).toEqual({
      id: null,
      inserted: false,
      skipped: "non-syncable-user",
    });
    const counts = await countOutboxByStatus(client);
    expect(counts.pending).toBe(0);
    expect(rowCount()).toBe(0);
  });

  it("без сесії рядки реального юзера лишаються на пристрої", async () => {
    // Контракт T3#2: немає автентифікованого юзера → з пристрою нічого
    // не летить. Робить неможливим регрес, у якому чужі рядки поїхали б
    // під щойно залогіненою кукою.
    const runtime = makeRuntime(() => Promise.resolve(null));
    await enqueueFinykOp(AUTHED_USER_ID, "op-authed-offline");

    await runtime.flushNow();

    expect(pushCalls).toHaveLength(0);
    expect((await countOutboxByStatus(client)).pending).toBe(1);
  });

  it("enqueue штовхає push сам, не чекаючи 30-секундного тіку", async () => {
    // Головний асерт цього файлу. Робить неможливим стан, у якому
    // `notifyEnqueued` — мертве API без жодного виклику (саме так було:
    // нуль виробничих call-site-ів на web і mobile), а єдиним тригером
    // push-у лишається таймер. Годинник тут НЕ рухаємо взагалі: якщо
    // ланцюг «enqueue → нудж → flush» розірветься, тест не дочекається
    // push-у і впаде, а не «пройде через 30 с».
    const runtime = makeRuntime(() => Promise.resolve(AUTHED_USER_ID));
    setOutboxEnqueueNudge(() => runtime.notifyEnqueued());
    runtime.start();

    await enqueueFinykOp(AUTHED_USER_ID, "op-authed-2");
    await vi.waitFor(() => expect(pushCalls).toHaveLength(1));

    expect(pushCalls[0]![0]!.idempotency_key).toBe("op-authed-2");
    expect((await countOutboxByStatus(client)).pending).toBe(0);
    runtime.stop();
  });
});
