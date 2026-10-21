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
 * знахідка з `docs/work/specs/tech-debt/frontend.md § Критичне` прожила
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
  markOutboxSuccessBatch,
  planRetry,
  ROUTINE_CLIENT_MIGRATIONS,
  ROUTINE_MIGRATIONS_TABLE,
} from "@sergeant/db-schema/sqlite";
import { ApiError, runSyncEnginePushOnce } from "@sergeant/api-client";
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
  function makeRuntime(
    resolveUserId: () => Promise<string | null>,
    backlog: { catchUpDelayMs?: number; flushOnStart?: boolean } = {},
  ) {
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
      ...backlog,
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

  it("черга, збережена до запуску, доганяється без нових enqueue і 30-секундних пауз", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const runtime = makeRuntime(() => Promise.resolve(AUTHED_USER_ID), {
      catchUpDelayMs: 2_000,
      flushOnStart: true,
    });
    try {
      for (let i = 0; i < 350; i += 1) {
        await enqueueFinykOp(AUTHED_USER_ID, `old-backlog-${i}`);
      }
      runtime.start();
      await runtime.flushNow();
      expect((await countOutboxByStatus(client)).pending).toBe(250);
      await vi.advanceTimersByTimeAsync(6_000);
      expect((await countOutboxByStatus(client)).pending).toBe(0);
      expect(pushCalls.map((batch) => batch.length)).toEqual([
        100, 100, 100, 50,
      ]);
      expect(
        new Set(pushCalls.flat().map((op) => op.idempotency_key)).size,
      ).toBe(350);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(pushCalls).toHaveLength(4);
    } finally {
      runtime.stop();
      vi.useRealTimers();
    }
  });

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

  it("поганий рядок у батчі не відхиляє сусідні записи в SQLite", async () => {
    for (const key of ["good-before", "bad-middle", "good-after"]) {
      await enqueueFinykOp(AUTHED_USER_ID, key);
    }
    const result = await runSyncEnginePushOnce(
      {
        drain: (options) =>
          drainSyncOpOutbox(client, { ...options, userId: AUTHED_USER_ID }),
        push: async (ops) => {
          if (ops.some((op) => op.idempotency_key === "bad-middle")) {
            throw new ApiError({
              kind: "http",
              status: 400,
              message: "bad row",
              url: "/api/v2/sync/push",
            });
          }
          return applyAll(ops);
        },
        markSuccess: (id) => markOutboxSuccess(client, id),
        markRetry: (id, plan) => markOutboxRetry(client, id, plan),
        markRejected: (id, reason) => markOutboxRejected(client, id, reason),
        planRetry,
        now: () => new Date("2026-07-25T10:00:00.000Z"),
      },
      { limit: 100 },
    );
    expect(result).toEqual({ drained: 3, pushed: 2, retried: 0, rejected: 1 });
    expect(await countOutboxByStatus(client)).toMatchObject({
      pending: 0,
      rejected: 1,
    });
    expect(rowCount()).toBe(1);
    const survivor = db
      .prepare("SELECT idempotency_key, reject_reason FROM sync_op_outbox")
      .get();
    expect(survivor).toEqual({
      idempotency_key: "bad-middle",
      reject_reason: "http_400",
    });
  });

  it("довга черга підтверджується пакетами в межах ліміту SQLite", async () => {
    for (let index = 0; index < 256; index += 1) {
      await enqueueFinykOp(AUTHED_USER_ID, `long-queue-${index}`);
    }
    const batches: number[] = [];
    const deps = {
      drain: (options: { limit: number; now: Date }) =>
        drainSyncOpOutbox(client, { ...options, userId: AUTHED_USER_ID }),
      push: async (ops: SyncV2PushOp[]) => applyAll(ops),
      markSuccess: (id: number) => markOutboxSuccess(client, id),
      markSuccessBatch: async (ids: readonly number[]) => {
        batches.push(ids.length);
        await markOutboxSuccessBatch(client, ids);
      },
      markRetry: (id: number, retry: ReturnType<typeof planRetry>) =>
        markOutboxRetry(client, id, retry),
      markRejected: (id: number, reason: string) =>
        markOutboxRejected(client, id, reason),
      planRetry,
      now: () => new Date("2026-07-25T10:00:00.000Z"),
    };

    const first = await runSyncEnginePushOnce(deps, { limit: 256 });
    const second = await runSyncEnginePushOnce(deps, { limit: 256 });

    expect(first).toMatchObject({ drained: 255, pushed: 255, hasMore: true });
    expect(second).toEqual({ drained: 1, pushed: 1, retried: 0, rejected: 0 });
    expect(batches).toEqual([200, 55, 1]);
    expect((await countOutboxByStatus(client)).pending).toBe(0);
    expect(rowCount()).toBe(0);
  });

  it("втрачена після server apply відповідь повторюється з тим самим ключем", async () => {
    await enqueueFinykOp(AUTHED_USER_ID, "lost-response");
    let now = new Date("2026-07-25T10:00:00.000Z");
    const accepted = new Set<string>();
    const sent: string[] = [];
    const deps = {
      drain: (options: { limit: number; now: Date }) =>
        drainSyncOpOutbox(client, { ...options, userId: AUTHED_USER_ID }),
      push: async (ops: SyncV2PushOp[]) => {
        const key = ops[0]!.idempotency_key;
        sent.push(key);
        if (!accepted.has(key)) {
          accepted.add(key);
          throw new ApiError({
            kind: "network",
            message: "response lost after apply",
            url: "/api/v2/sync/push",
          });
        }
        return {
          accepted: 0,
          last_op_id: 1,
          results: [{ idempotency_key: key, status: "duplicate" as const }],
        };
      },
      markSuccess: (id: number) => markOutboxSuccess(client, id),
      markRetry: (id: number, retry: ReturnType<typeof planRetry>) =>
        markOutboxRetry(client, id, retry),
      markRejected: (id: number, reason: string) =>
        markOutboxRejected(client, id, reason),
      planRetry,
      now: () => now,
    };

    expect(await runSyncEnginePushOnce(deps, { limit: 100 })).toMatchObject({
      retried: 1,
      pushed: 0,
    });
    expect((await countOutboxByStatus(client)).pending).toBe(1);
    expect(await runSyncEnginePushOnce(deps, { limit: 100 })).toMatchObject({
      drained: 0,
    });
    now = new Date(now.getTime() + 1_000);
    expect(await runSyncEnginePushOnce(deps, { limit: 100 })).toMatchObject({
      pushed: 1,
      retried: 0,
    });
    expect(sent).toEqual(["lost-response", "lost-response"]);
    expect(accepted.size).toBe(1);
    expect(rowCount()).toBe(0);
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
    // rel-08: нудж коалесується (тиша ~1,5 с), тож вікно очікування ширше
    // за дефолтні 1 с `waitFor`; усе одно в рази коротше за 30-секундний тік.
    await vi.waitFor(() => expect(pushCalls).toHaveLength(1), {
      timeout: 4_000,
    });

    expect(pushCalls[0]![0]!.idempotency_key).toBe("op-authed-2");
    expect((await countOutboxByStatus(client)).pending).toBe(0);
    runtime.stop();
  });
});
