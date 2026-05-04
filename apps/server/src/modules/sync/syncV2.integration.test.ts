/**
 * Integration tests для `/api/v2/sync/*` (PR #021 — Stage 2 op-log sync).
 *
 * Запускаються через `vitest.integration.config.ts` (включається у
 * `pnpm test:integration`, не у дефолтному `pnpm test`). Реальний
 * Postgres у Testcontainers — `pgvector/pgvector:pg16` (бо інші
 * міграції залежать від `vector` extension; v2 на нього не покладається,
 * але міграція 025 застосовується перед нашою 027 у тому ж раннері).
 *
 * Тести викликають handler-и `syncV2Push` / `syncV2Pull` напряму, як
 * у `sync.test.ts`-у v1, обходячи Express (фейковий req/res). Це
 * швидше за supertest і дозволяє ефективно тестувати idempotency-
 * та LWW-семантику без full-stack-у.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import type { Request, Response } from "express";

import { syncV2Pull, syncV2Push } from "./syncV2.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");

const TIMEOUT_MS = 240_000;

let container: StartedTestContainer | undefined;
let testPool: pg.Pool | undefined;
let dockerAvailable = false;
let skipReason: string | null = null;

async function runMigrations(p: pg.Pool): Promise<void> {
  const files = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
    .sort();
  for (const file of sqlFiles) {
    const sql = (
      await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8")
    ).trim();
    if (!sql) continue;
    await p.query(sql);
  }
}

async function ensureUser(userId: string): Promise<void> {
  if (!testPool) throw new Error("pool not initialized");
  await testPool.query(
    `INSERT INTO "user" (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, false, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [userId, `${userId}@test.local`, userId],
  );
}

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

interface TestReqInit {
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  userId: string;
}

function makeReq({
  body,
  query,
  headers,
  userId,
}: TestReqInit): Request & { user: { id: string } } {
  return {
    body: body ?? {},
    query: query ?? {},
    headers: headers ?? {},
    user: { id: userId },
  } as unknown as Request & { user: { id: string } };
}

beforeAll(async () => {
  try {
    container = await new GenericContainer("pgvector/pgvector:pg16")
      .withEnvironment({
        POSTGRES_USER: "hub",
        POSTGRES_PASSWORD: "hub",
        POSTGRES_DB: "hub_test",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const uri = `postgresql://hub:hub@${host}:${port}/hub_test`;

    // syncV2.ts читає `pool` через імпорт `../../db.js`. Точково
    // перевизначаємо `DATABASE_URL` ДО першого імпорту db.js — але db.js
    // вже міг бути імпортованим транзитивно через syncV2.ts. Найбільш
    // надійно: створити тестовий pool на той самий контейнер і інжектити
    // через monkey-patch модуля. Для PR #021 SPIKE простіше: піднімаємо
    // env, переконуємось, що db.js імпортує цей же URL.
    process.env.DATABASE_URL = uri;

    testPool = new pg.Pool({ connectionString: uri, max: 5 });
    await runMigrations(testPool);
    dockerAvailable = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message : String(e);
    console.warn(
      `[syncV2 integration] Skipping: testcontainers unavailable — ${skipReason}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (testPool) await testPool.end().catch(() => {});
  if (container) await container.stop().catch(() => {});
}, TIMEOUT_MS);

beforeEach(async () => {
  if (!testPool || !dockerAvailable) return;
  // Чистимо тільки op-log + routine-таблиці; user-рядки cascade-нуть
  // через FK і дешевше було б truncate з CASCADE, але міграції вже
  // створили `user` row-и для попередніх suite-ів. Точкове вичищення
  // ізолює тести між собою.
  await testPool.query(
    `TRUNCATE sync_op_log, sync_audit_log,
              routine_entries, routine_streaks,
              fizruk_workout_sets, fizruk_workout_items, fizruk_workouts,
              fizruk_custom_exercises, fizruk_measurements,
              nutrition_pantry_items, nutrition_pantries,
              nutrition_meals, nutrition_prefs, nutrition_recipes,
              finyk_hidden_accounts, finyk_hidden_transactions,
              finyk_budgets, finyk_subscriptions, finyk_assets,
              finyk_debts, finyk_receivables, finyk_custom_categories,
              finyk_manual_expenses, finyk_tx_filters,
              finyk_tx_categories, finyk_tx_splits,
              finyk_mono_debt_links, finyk_networth_history,
              finyk_prefs
              RESTART IDENTITY CASCADE`,
  );
});

function isoNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

describe("syncV2Push / syncV2Pull integration", () => {
  it(
    "happy path — push 3 routine_entries, pull from another device returns all 3",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-happy");

      const ts = isoNow();
      const ops = [
        {
          table: "routine_entries",
          op: "insert" as const,
          row: {
            id: "11111111-1111-1111-1111-111111111111",
            user_id: "u-happy",
            name: "drink water",
            completed_at: ts,
          },
          client_ts: ts,
          idempotency_key: "happy-1",
        },
        {
          table: "routine_entries",
          op: "insert" as const,
          row: {
            id: "22222222-2222-2222-2222-222222222222",
            user_id: "u-happy",
            name: "stretch",
            completed_at: ts,
          },
          client_ts: ts,
          idempotency_key: "happy-2",
        },
        {
          table: "routine_entries",
          op: "insert" as const,
          row: {
            id: "33333333-3333-3333-3333-333333333333",
            user_id: "u-happy",
            name: "read",
            completed_at: ts,
          },
          client_ts: ts,
          idempotency_key: "happy-3",
        },
      ];

      const pushRes = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-happy",
          body: { ops },
          headers: { "x-origin-device-id": "device-A" },
        }),
        pushRes,
      );

      expect(pushRes.statusCode).toBe(200);
      const pushBody = pushRes.body as {
        accepted: number;
        last_op_id: number;
        results: Array<{ idempotency_key: string; status: string }>;
      };
      expect(pushBody.accepted).toBe(3);
      expect(pushBody.last_op_id).toBeGreaterThan(0);
      expect(typeof pushBody.last_op_id).toBe("number");
      expect(pushBody.results.map((r) => r.status)).toEqual([
        "applied",
        "applied",
        "applied",
      ]);

      // Pull from device B — повинні побачити всі 3 ops.
      const pullRes = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-happy",
          query: { since: 0 },
          headers: { "x-origin-device-id": "device-B" },
        }),
        pullRes,
      );

      expect(pullRes.statusCode).toBe(200);
      const pullBody = pullRes.body as {
        ops: Array<{ id: number; table: string; row: { name: string } }>;
        next_cursor: number | null;
      };
      expect(pullBody.ops).toHaveLength(3);
      expect(pullBody.ops.map((o) => o.row.name)).toEqual([
        "drink water",
        "stretch",
        "read",
      ]);
      expect(typeof pullBody.ops[0].id).toBe("number");
      expect(pullBody.next_cursor).toBeNull();

      // Пристрій А повинен сам себе виключати по `X-Origin-Device-Id`.
      const sameDeviceRes = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-happy",
          query: { since: 0 },
          headers: { "x-origin-device-id": "device-A" },
        }),
        sameDeviceRes,
      );
      const sameBody = sameDeviceRes.body as { ops: unknown[] };
      expect(sameBody.ops).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  it(
    "idempotency — повторний push того ж idempotency_key не дублює row",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-idem");

      const ts = isoNow();
      const op = {
        table: "routine_entries",
        op: "insert" as const,
        row: {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          user_id: "u-idem",
          name: "meditate",
          completed_at: ts,
        },
        client_ts: ts,
        idempotency_key: "idem-1",
      };

      const r1 = makeRes();
      await syncV2Push(makeReq({ userId: "u-idem", body: { ops: [op] } }), r1);
      const r1Body = r1.body as {
        accepted: number;
        results: Array<{ status: string }>;
      };
      expect(r1Body.accepted).toBe(1);
      expect(r1Body.results[0].status).toBe("applied");

      // Повтор — той самий idempotency_key.
      const r2 = makeRes();
      await syncV2Push(makeReq({ userId: "u-idem", body: { ops: [op] } }), r2);
      const r2Body = r2.body as {
        accepted: number;
        results: Array<{ status: string }>;
      };
      // accepted=1 бо ми повертаємо кешований applied (а не "duplicate")
      // — для UI clients це коректно, бо first-write мав ефект.
      expect(r2Body.accepted).toBe(1);
      expect(r2Body.results[0].status).toBe("applied");

      // Один рядок у `routine_entries`, один рядок у `sync_op_log`.
      const entryCount = await testPool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM routine_entries WHERE user_id = $1`,
        ["u-idem"],
      );
      expect(Number(entryCount.rows[0].c)).toBe(1);

      const logCount = await testPool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM sync_op_log WHERE user_id = $1`,
        ["u-idem"],
      );
      expect(Number(logCount.rows[0].c)).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    "LWW — старший client_ts після свіжішого reject-нуто як lww_conflict",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-lww");

      const idA = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
      const newer = isoNow();
      const older = isoNow(-5_000);

      // 1) Свіжіша версія приходить першою.
      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-lww",
          body: {
            ops: [
              {
                table: "routine_entries",
                op: "insert" as const,
                row: {
                  id: idA,
                  user_id: "u-lww",
                  name: "newer",
                  completed_at: newer,
                },
                client_ts: newer,
                idempotency_key: "lww-newer",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      // 2) Старіша версія тієї ж row — повинна бути reject-нута.
      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-lww",
          body: {
            ops: [
              {
                table: "routine_entries",
                op: "update" as const,
                row: {
                  id: idA,
                  user_id: "u-lww",
                  name: "older",
                  completed_at: older,
                },
                client_ts: older,
                idempotency_key: "lww-older",
              },
            ],
          },
        }),
        r2,
      );
      const r2Body = r2.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(r2Body.accepted).toBe(0);
      expect(r2Body.results[0].status).toBe("rejected");
      expect(r2Body.results[0].reason).toBe("lww_conflict");

      // У БД — все ще "newer".
      const row = await testPool.query<{ name: string }>(
        `SELECT name FROM routine_entries WHERE id = $1`,
        [idA],
      );
      expect(row.rows[0].name).toBe("newer");
    },
    TIMEOUT_MS,
  );

  it(
    "replay safety — pull-апплай-репуш дедуплікується по idempotency_key",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-replay");

      const ts = isoNow();
      const ops = [
        {
          table: "routine_entries",
          op: "insert" as const,
          row: {
            id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            user_id: "u-replay",
            name: "first",
            completed_at: ts,
          },
          client_ts: ts,
          idempotency_key: "replay-1",
        },
      ];

      // Спочатку — запис з пристрою А.
      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-replay",
          body: { ops },
          headers: { "x-origin-device-id": "device-A" },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      // Pull з пристрою B.
      const pull = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-replay",
          query: { since: 0 },
          headers: { "x-origin-device-id": "device-B" },
        }),
        pull,
      );
      const pullBody = pull.body as {
        ops: Array<{
          table: string;
          op: "insert" | "update" | "delete";
          row: Record<string, unknown>;
          client_ts: string;
        }>;
      };
      expect(pullBody.ops).toHaveLength(1);

      // Пристрій B апплаїть локально, потім по помилці пуш-репеат із
      // тим самим idempotency_key, який зберігся у локальному op-log-у.
      const replayOps = pullBody.ops.map((o) => ({
        table: o.table,
        op: o.op,
        row: o.row,
        client_ts: o.client_ts,
        idempotency_key: "replay-1",
      }));
      const r3 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-replay",
          body: { ops: replayOps },
          headers: { "x-origin-device-id": "device-B" },
        }),
        r3,
      );
      const r3Body = r3.body as {
        accepted: number;
        results: Array<{ status: string }>;
      };
      // Повертаємо кешований applied — клієнту байдуже, що це "duplicate"
      // в semantic-смислі; перевіряємо що БД не отримала second insert.
      expect(r3Body.results[0].status).toBe("applied");

      const count = await testPool.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM sync_op_log WHERE user_id = $1`,
        ["u-replay"],
      );
      expect(Number(count.rows[0].c)).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    "max ops — > 200 ops у push повертає 400 invalid",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-cap");

      const ts = isoNow();
      const tooMany = Array.from({ length: 201 }, (_, i) => ({
        table: "routine_entries",
        op: "insert" as const,
        row: { id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}` },
        client_ts: ts,
        idempotency_key: `cap-${i}`,
      }));

      const res = makeRes();
      await syncV2Push(
        makeReq({ userId: "u-cap", body: { ops: tooMany } }),
        res,
      );
      expect(res.statusCode).toBe(400);
    },
    TIMEOUT_MS,
  );

  it(
    "table not in whitelist — rejected with table_not_allowed",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-wl");

      const ts = isoNow();
      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-wl",
          body: {
            ops: [
              {
                table: "module_data",
                op: "insert" as const,
                row: { id: "x" },
                client_ts: ts,
                idempotency_key: "wl-1",
              },
            ],
          },
        }),
        res,
      );
      const body = res.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body.accepted).toBe(0);
      expect(body.results[0].status).toBe("rejected");
      expect(body.results[0].reason).toBe("table_not_allowed");
    },
    TIMEOUT_MS,
  );

  it(
    "pull pagination — limit поверне next_cursor, наступний pull продовжить з нього",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-page");

      const ts = isoNow();
      const ops = Array.from({ length: 5 }, (_, i) => ({
        table: "routine_entries",
        op: "insert" as const,
        row: {
          id: `dddddddd-dddd-dddd-dddd-${String(i).padStart(12, "0")}`,
          user_id: "u-page",
          name: `entry-${i}`,
          completed_at: ts,
        },
        client_ts: ts,
        idempotency_key: `page-${i}`,
      }));
      const push = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-page",
          body: { ops },
          headers: { "x-origin-device-id": "device-A" },
        }),
        push,
      );
      expect((push.body as { accepted: number }).accepted).toBe(5);

      const page1 = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-page",
          query: { since: 0, limit: 2 },
          headers: { "x-origin-device-id": "device-B" },
        }),
        page1,
      );
      const page1Body = page1.body as {
        ops: Array<{ id: number }>;
        next_cursor: number | null;
      };
      expect(page1Body.ops).toHaveLength(2);
      expect(page1Body.next_cursor).not.toBeNull();

      const page2 = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-page",
          query: { since: page1Body.next_cursor!, limit: 2 },
          headers: { "x-origin-device-id": "device-B" },
        }),
        page2,
      );
      const page2Body = page2.body as {
        ops: Array<{ id: number }>;
        next_cursor: number | null;
      };
      expect(page2Body.ops).toHaveLength(2);
      expect(page2Body.next_cursor).not.toBeNull();

      const page3 = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-page",
          query: { since: page2Body.next_cursor!, limit: 2 },
          headers: { "x-origin-device-id": "device-B" },
        }),
        page3,
      );
      const page3Body = page3.body as {
        ops: Array<{ id: number }>;
        next_cursor: number | null;
      };
      expect(page3Body.ops).toHaveLength(1);
      expect(page3Body.next_cursor).toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "delete op — soft-deletes routine_entries row",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-del");

      const id = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
      const t1 = isoNow(-1_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-del",
          body: {
            ops: [
              {
                table: "routine_entries",
                op: "insert" as const,
                row: {
                  id,
                  user_id: "u-del",
                  name: "to-delete",
                  completed_at: t1,
                },
                client_ts: t1,
                idempotency_key: "del-1",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-del",
          body: {
            ops: [
              {
                table: "routine_entries",
                op: "delete" as const,
                row: { id, user_id: "u-del" },
                client_ts: t2,
                idempotency_key: "del-2",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM routine_entries WHERE id = $1`,
        [id],
      );
      expect(row.rows[0].deleted_at).not.toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "routine_streaks upsert — agreggate-таблиця приймає insert/update",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-streak");

      const t1 = isoNow(-1_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-streak",
          body: {
            ops: [
              {
                table: "routine_streaks",
                op: "insert" as const,
                row: {
                  user_id: "u-streak",
                  current_streak: 1,
                  longest_streak: 1,
                  last_completed_at: t1,
                },
                client_ts: t1,
                idempotency_key: "streak-1",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-streak",
          body: {
            ops: [
              {
                table: "routine_streaks",
                op: "update" as const,
                row: {
                  user_id: "u-streak",
                  current_streak: 5,
                  longest_streak: 5,
                  last_completed_at: t2,
                },
                client_ts: t2,
                idempotency_key: "streak-2",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ current_streak: number }>(
        `SELECT current_streak FROM routine_streaks WHERE user_id = $1`,
        ["u-streak"],
      );
      expect(row.rows[0].current_streak).toBe(5);
    },
    TIMEOUT_MS,
  );

  it(
    "clock skew — client_ts > server+1h reject-нуто",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-skew");

      const farFuture = isoNow(2 * 60 * 60 * 1000); // +2h
      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-skew",
          body: {
            ops: [
              {
                table: "routine_entries",
                op: "insert" as const,
                row: {
                  id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
                  user_id: "u-skew",
                  name: "future",
                },
                client_ts: farFuture,
                idempotency_key: "skew-1",
              },
            ],
          },
        }),
        res,
      );
      const body = res.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body.accepted).toBe(0);
      expect(body.results[0].reason).toBe("clock_skew");
    },
    TIMEOUT_MS,
  );
});

// ---------------------------------------------------------------------
// Fizruk apply-функції — Stage 4 PR #029.
//
// Покриваємо найважливіші інваріанти:
//   1. Per-row UPSERT для `fizruk_workouts` працює (insert → update).
//   2. LWW guard на `fizruk_workouts` — старіший client_ts відкидається.
//   3. Soft-delete (op="delete") пише `deleted_at` замість DELETE row-у.
//   4. FK-зв'язок `fizruk_workout_items.workout_id` коректно застосовує
//      child після parent (один батч, один push).
//   5. `applyFizrukMeasurements` — валідує `measured_at` як required.
//
// Решту 5-х apply-фн (sets / custom_exercises) покриває та сама
// shape — UUID PK, user-ownership, LWW, soft-delete — тому окремі
// e2e не потрібні: при регресії `fizruk_workouts` тести впадуть першими.
// ---------------------------------------------------------------------
describe("syncV2Push — fizruk apply-функції (PR #029)", () => {
  it(
    "fizruk_workouts: insert → update (новіший client_ts перезаписує)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fz-w");

      const workoutId = "00000000-0000-4000-8000-000000000001";
      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-w",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "insert" as const,
                row: {
                  id: workoutId,
                  user_id: "u-fz-w",
                  started_at: t1,
                  ended_at: null,
                  note: "leg day",
                  groups_json: [],
                },
                client_ts: t1,
                idempotency_key: "fz-w-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-w",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "update" as const,
                row: {
                  id: workoutId,
                  user_id: "u-fz-w",
                  started_at: t1,
                  ended_at: t2,
                  note: "leg day — done",
                  groups_json: [],
                },
                client_ts: t2,
                idempotency_key: "fz-w-update",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{
        note: string;
        ended_at: Date | null;
      }>(`SELECT note, ended_at FROM fizruk_workouts WHERE id = $1`, [
        workoutId,
      ]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].note).toBe("leg day — done");
      expect(row.rows[0].ended_at).not.toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_workouts: старіший client_ts після свіжішого reject-нуто (LWW)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fz-lww");

      const workoutId = "00000000-0000-4000-8000-000000000002";
      const newer = isoNow();
      const older = isoNow(-5_000);

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-lww",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "insert" as const,
                row: {
                  id: workoutId,
                  user_id: "u-fz-lww",
                  started_at: newer,
                  note: "newer",
                },
                client_ts: newer,
                idempotency_key: "fz-lww-newer",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-lww",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "update" as const,
                row: {
                  id: workoutId,
                  user_id: "u-fz-lww",
                  started_at: older,
                  note: "older",
                },
                client_ts: older,
                idempotency_key: "fz-lww-older",
              },
            ],
          },
        }),
        r2,
      );
      const r2Body = r2.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(r2Body.accepted).toBe(0);
      expect(r2Body.results[0].status).toBe("rejected");
      expect(r2Body.results[0].reason).toBe("lww_conflict");

      const row = await testPool.query<{ note: string }>(
        `SELECT note FROM fizruk_workouts WHERE id = $1`,
        [workoutId],
      );
      expect(row.rows[0].note).toBe("newer");
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_workouts: op='delete' — soft-delete, рядок лишається з deleted_at",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fz-del");

      const workoutId = "00000000-0000-4000-8000-000000000003";
      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-del",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "insert" as const,
                row: {
                  id: workoutId,
                  user_id: "u-fz-del",
                  started_at: t1,
                },
                client_ts: t1,
                idempotency_key: "fz-del-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-del",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "delete" as const,
                row: { id: workoutId, user_id: "u-fz-del" },
                client_ts: t2,
                idempotency_key: "fz-del-delete",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM fizruk_workouts WHERE id = $1`,
        [workoutId],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].deleted_at).not.toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_workout_items: parent-then-child в одному батчі застосовуються коректно",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fz-fk");

      const workoutId = "00000000-0000-4000-8000-000000000010";
      const itemId = "00000000-0000-4000-8000-000000000011";
      const ts = isoNow();

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-fk",
          body: {
            ops: [
              {
                table: "fizruk_workouts",
                op: "insert" as const,
                row: {
                  id: workoutId,
                  user_id: "u-fz-fk",
                  started_at: ts,
                },
                client_ts: ts,
                idempotency_key: "fz-fk-w",
              },
              {
                table: "fizruk_workout_items",
                op: "insert" as const,
                row: {
                  id: itemId,
                  workout_id: workoutId,
                  user_id: "u-fz-fk",
                  exercise_id: "ex-1",
                  name_uk: "Присідання",
                  primary_group: "legs",
                  type: "strength",
                  sort_order: 0,
                },
                client_ts: ts,
                idempotency_key: "fz-fk-i",
              },
            ],
          },
        }),
        res,
      );
      expect((res.body as { accepted: number }).accepted).toBe(2);

      const row = await testPool.query<{ workout_id: string }>(
        `SELECT workout_id FROM fizruk_workout_items WHERE id = $1`,
        [itemId],
      );
      expect(row.rows[0].workout_id).toBe(workoutId);
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_measurements: insert з measured_at працює коректно",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fz-m-ok");

      const id = "00000000-0000-4000-8000-000000000021";
      const ts = isoNow();

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-m-ok",
          body: {
            ops: [
              {
                table: "fizruk_measurements",
                op: "insert" as const,
                row: {
                  id,
                  user_id: "u-fz-m-ok",
                  measured_at: ts,
                  weight_kg: 80,
                },
                client_ts: ts,
                idempotency_key: "fz-m-ok",
              },
            ],
          },
        }),
        res,
      );
      expect((res.body as { accepted: number }).accepted).toBe(1);
    },
    TIMEOUT_MS,
  );

  it(
    "fizruk_measurements: insert без measured_at reject-ається з invalid_measured_at",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fz-m");

      const id = "00000000-0000-4000-8000-000000000020";
      const ts = isoNow();

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fz-m",
          body: {
            ops: [
              {
                table: "fizruk_measurements",
                op: "insert" as const,
                row: {
                  id,
                  user_id: "u-fz-m",
                  weight_kg: 80,
                },
                client_ts: ts,
                idempotency_key: "fz-m-bad",
              },
            ],
          },
        }),
        res,
      );
      const body = res.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body.accepted).toBe(0);
      expect(body.results[0].reason).toBe("invalid_measured_at");
    },
    TIMEOUT_MS,
  );
});

// ---------------------------------------------------------------------
// Nutrition apply-функції — Stage 4 PR #031.
//
// Покриваємо:
//   1. nutrition_meals: insert → update, LWW reject, soft-delete.
//   2. nutrition_pantries: insert → update.
//   3. nutrition_pantry_items: parent-then-child в одному батчі.
//   4. nutrition_prefs: singleton upsert, delete rejected.
//   5. nutrition_recipes: insert → soft-delete.
// ---------------------------------------------------------------------
describe("syncV2Push — nutrition apply-функції (PR #031)", () => {
  it(
    "nutrition_meals: insert → update (новіший client_ts перезаписує)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nm");

      const mealId = "10000000-0000-4000-8000-000000000001";
      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "insert" as const,
                row: {
                  id: mealId,
                  user_id: "u-nm",
                  eaten_at: t1,
                  meal_type: "lunch",
                  name: "borshch",
                  kcal: 350,
                  protein_g: 12.5,
                },
                client_ts: t1,
                idempotency_key: "nm-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "update" as const,
                row: {
                  id: mealId,
                  user_id: "u-nm",
                  eaten_at: t1,
                  meal_type: "lunch",
                  name: "borshch — updated",
                  kcal: 400,
                  protein_g: 15,
                },
                client_ts: t2,
                idempotency_key: "nm-update",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ name: string; kcal: number }>(
        `SELECT name, kcal FROM nutrition_meals WHERE id = $1`,
        [mealId],
      );
      expect(row.rows[0].name).toBe("borshch — updated");
      expect(row.rows[0].kcal).toBe(400);
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_meals: старіший client_ts reject-нуто (LWW)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nm-lww");

      const mealId = "10000000-0000-4000-8000-000000000002";
      const newer = isoNow();
      const older = isoNow(-5_000);

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm-lww",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "insert" as const,
                row: {
                  id: mealId,
                  user_id: "u-nm-lww",
                  eaten_at: newer,
                  name: "newer",
                },
                client_ts: newer,
                idempotency_key: "nm-lww-newer",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm-lww",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "update" as const,
                row: {
                  id: mealId,
                  user_id: "u-nm-lww",
                  eaten_at: older,
                  name: "older",
                },
                client_ts: older,
                idempotency_key: "nm-lww-older",
              },
            ],
          },
        }),
        r2,
      );
      const r2Body = r2.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(r2Body.accepted).toBe(0);
      expect(r2Body.results[0].reason).toBe("lww_conflict");
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_meals: op='delete' — soft-delete",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nm-del");

      const mealId = "10000000-0000-4000-8000-000000000003";
      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm-del",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "insert" as const,
                row: {
                  id: mealId,
                  user_id: "u-nm-del",
                  eaten_at: t1,
                  name: "to-delete",
                },
                client_ts: t1,
                idempotency_key: "nm-del-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm-del",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "delete" as const,
                row: { id: mealId, user_id: "u-nm-del" },
                client_ts: t2,
                idempotency_key: "nm-del-delete",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM nutrition_meals WHERE id = $1`,
        [mealId],
      );
      expect(row.rows[0].deleted_at).not.toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_meals: insert без eaten_at reject-ається",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nm-bad");

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nm-bad",
          body: {
            ops: [
              {
                table: "nutrition_meals",
                op: "insert" as const,
                row: {
                  id: "10000000-0000-4000-8000-000000000004",
                  user_id: "u-nm-bad",
                  name: "no-eaten-at",
                },
                client_ts: isoNow(),
                idempotency_key: "nm-bad-1",
              },
            ],
          },
        }),
        res,
      );
      const body = res.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body.accepted).toBe(0);
      expect(body.results[0].reason).toBe("invalid_eaten_at");
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_pantries + nutrition_pantry_items: parent-then-child в одному батчі",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-np");

      const pantryId = "20000000-0000-4000-8000-000000000001";
      const itemId = "20000000-0000-4000-8000-000000000002";
      const ts = isoNow();

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-np",
          body: {
            ops: [
              {
                table: "nutrition_pantries",
                op: "insert" as const,
                row: {
                  id: pantryId,
                  user_id: "u-np",
                  name: "Холодильник",
                  text: "",
                },
                client_ts: ts,
                idempotency_key: "np-pantry",
              },
              {
                table: "nutrition_pantry_items",
                op: "insert" as const,
                row: {
                  id: itemId,
                  pantry_id: pantryId,
                  user_id: "u-np",
                  name: "Молоко",
                  qty: 1,
                  unit: "л",
                  sort_order: 0,
                },
                client_ts: ts,
                idempotency_key: "np-item",
              },
            ],
          },
        }),
        res,
      );
      expect((res.body as { accepted: number }).accepted).toBe(2);

      const pantryRow = await testPool.query<{ name: string }>(
        `SELECT name FROM nutrition_pantries WHERE id = $1`,
        [pantryId],
      );
      expect(pantryRow.rows[0].name).toBe("Холодильник");

      const itemRow = await testPool.query<{
        pantry_id: string;
        name: string;
        qty: number;
      }>(
        `SELECT pantry_id, name, qty FROM nutrition_pantry_items WHERE id = $1`,
        [itemId],
      );
      expect(itemRow.rows[0].pantry_id).toBe(pantryId);
      expect(itemRow.rows[0].name).toBe("Молоко");
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_prefs: singleton upsert — insert потім update",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nprefs");

      const t1 = isoNow(-2_000);
      const t2 = isoNow();
      const pantryId = "30000000-0000-4000-8000-000000000001";

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nprefs",
          body: {
            ops: [
              {
                table: "nutrition_prefs",
                op: "insert" as const,
                row: {
                  user_id: "u-nprefs",
                  prefs_json: { kcal_target: 2000 },
                  active_pantry_id: null,
                },
                client_ts: t1,
                idempotency_key: "nprefs-1",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nprefs",
          body: {
            ops: [
              {
                table: "nutrition_prefs",
                op: "update" as const,
                row: {
                  user_id: "u-nprefs",
                  prefs_json: { kcal_target: 2500 },
                  active_pantry_id: pantryId,
                },
                client_ts: t2,
                idempotency_key: "nprefs-2",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{
        prefs_json: { kcal_target: number };
        active_pantry_id: string | null;
      }>(
        `SELECT prefs_json, active_pantry_id FROM nutrition_prefs WHERE user_id = $1`,
        ["u-nprefs"],
      );
      expect(row.rows[0].prefs_json).toEqual({ kcal_target: 2500 });
      expect(row.rows[0].active_pantry_id).toBe(pantryId);
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_prefs: delete op rejected",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nprefs-del");

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nprefs-del",
          body: {
            ops: [
              {
                table: "nutrition_prefs",
                op: "delete" as const,
                row: { user_id: "u-nprefs-del" },
                client_ts: isoNow(),
                idempotency_key: "nprefs-del-1",
              },
            ],
          },
        }),
        res,
      );
      const body = res.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body.accepted).toBe(0);
      expect(body.results[0].reason).toBe("delete_not_supported");
    },
    TIMEOUT_MS,
  );

  it(
    "nutrition_recipes: insert → soft-delete",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-nr");

      const recipeId = "40000000-0000-4000-8000-000000000001";
      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nr",
          body: {
            ops: [
              {
                table: "nutrition_recipes",
                op: "insert" as const,
                row: {
                  id: recipeId,
                  user_id: "u-nr",
                  name: "Борщ",
                  data_json: { servings: 4, ingredients: [] },
                },
                client_ts: t1,
                idempotency_key: "nr-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nr",
          body: {
            ops: [
              {
                table: "nutrition_recipes",
                op: "delete" as const,
                row: { id: recipeId, user_id: "u-nr" },
                client_ts: t2,
                idempotency_key: "nr-delete",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{
        name: string;
        deleted_at: Date | null;
      }>(`SELECT name, deleted_at FROM nutrition_recipes WHERE id = $1`, [
        recipeId,
      ]);
      expect(row.rows[0].name).toBe("Борщ");
      expect(row.rows[0].deleted_at).not.toBeNull();
    },
    TIMEOUT_MS,
  );
});

// ---------------------------------------------------------------------
// Finyk apply-функції — Stage 4 PR #035.
//
// Один integration-тест на shape (5 shapes у total, див. коментар в
// `apps/server/src/migrations/039_finyk_tables.sql` — composite-PK
// tombstone, per-row+JSONB, per-tx mapping, time-series, singleton
// prefs). Фокус — на унікальній логіці кожного shape, а не на
// повторюванні стандартної LWW-перевірки (її вже покривають nutrition
// інтеграційні тести вище — apply-фн поділяє ту саму інфраструктуру).
// ---------------------------------------------------------------------
describe("syncV2Push — finyk apply-функції (PR #035)", () => {
  it(
    "finyk_hidden_accounts: insert → soft-delete (composite-PK tombstone shape)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fha");

      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fha",
          body: {
            ops: [
              {
                table: "finyk_hidden_accounts",
                op: "insert" as const,
                row: {
                  user_id: "u-fha",
                  account_id: "mono-acc-42",
                },
                client_ts: t1,
                idempotency_key: "fha-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fha",
          body: {
            ops: [
              {
                table: "finyk_hidden_accounts",
                op: "delete" as const,
                row: { user_id: "u-fha", account_id: "mono-acc-42" },
                client_ts: t2,
                idempotency_key: "fha-delete",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM finyk_hidden_accounts
         WHERE user_id = $1 AND account_id = $2`,
        ["u-fha", "mono-acc-42"],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].deleted_at).not.toBeNull();
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_budgets: insert → update (per-row + JSONB blob shape, LWW honoured)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fb");

      const budgetId = "50000000-0000-4000-8000-000000000001";
      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fb",
          body: {
            ops: [
              {
                table: "finyk_budgets",
                op: "insert" as const,
                row: {
                  id: budgetId,
                  user_id: "u-fb",
                  data_json: { categoryId: "food", limit: 1000 },
                },
                client_ts: t1,
                idempotency_key: "fb-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fb",
          body: {
            ops: [
              {
                table: "finyk_budgets",
                op: "update" as const,
                row: {
                  id: budgetId,
                  user_id: "u-fb",
                  data_json: { categoryId: "food", limit: 1500 },
                },
                client_ts: t2,
                idempotency_key: "fb-update",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ data_json: { limit: number } }>(
        `SELECT data_json FROM finyk_budgets WHERE id = $1`,
        [budgetId],
      );
      expect(row.rows[0].data_json.limit).toBe(1500);

      // Stale (t1) update must lose to the t2 row already on disk.
      const r3 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fb",
          body: {
            ops: [
              {
                table: "finyk_budgets",
                op: "update" as const,
                row: {
                  id: budgetId,
                  user_id: "u-fb",
                  data_json: { categoryId: "food", limit: 9999 },
                },
                client_ts: t1,
                idempotency_key: "fb-stale",
              },
            ],
          },
        }),
        r3,
      );
      const body3 = r3.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body3.accepted).toBe(0);
      expect(body3.results[0].reason).toBe("lww_conflict");
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_tx_categories: insert → delete uses hard DELETE (no soft-delete column)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-ftc");

      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-ftc",
          body: {
            ops: [
              {
                table: "finyk_tx_categories",
                op: "insert" as const,
                row: {
                  user_id: "u-ftc",
                  transaction_id: "mono-tx-1",
                  category_id: "groceries",
                },
                client_ts: t1,
                idempotency_key: "ftc-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-ftc",
          body: {
            ops: [
              {
                table: "finyk_tx_categories",
                op: "delete" as const,
                row: { user_id: "u-ftc", transaction_id: "mono-tx-1" },
                client_ts: t2,
                idempotency_key: "ftc-delete",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const rows = await testPool.query(
        `SELECT 1 FROM finyk_tx_categories
           WHERE user_id = $1 AND transaction_id = $2`,
        ["u-ftc", "mono-tx-1"],
      );
      expect(rows.rows).toHaveLength(0);
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_networth_history: monthly upsert keeps month TEXT (composite (user_id, month) PK)",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fnh");

      const t1 = isoNow(-2_000);
      const t2 = isoNow();

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fnh",
          body: {
            ops: [
              {
                table: "finyk_networth_history",
                op: "insert" as const,
                row: {
                  user_id: "u-fnh",
                  month: "2026-04",
                  networth: 1234.5,
                },
                client_ts: t1,
                idempotency_key: "fnh-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fnh",
          body: {
            ops: [
              {
                table: "finyk_networth_history",
                op: "update" as const,
                row: {
                  user_id: "u-fnh",
                  month: "2026-04",
                  networth: 1500,
                },
                client_ts: t2,
                idempotency_key: "fnh-update",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{ networth: number; month: string }>(
        `SELECT month, networth FROM finyk_networth_history
           WHERE user_id = $1 AND month = $2`,
        ["u-fnh", "2026-04"],
      );
      expect(row.rows[0].month).toBe("2026-04");
      expect(row.rows[0].networth).toBeCloseTo(1500, 5);
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_networth_history: invalid month string is rejected",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fnh-bad");

      const r = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fnh-bad",
          body: {
            ops: [
              {
                table: "finyk_networth_history",
                op: "insert" as const,
                row: {
                  user_id: "u-fnh-bad",
                  month: "April 2026",
                  networth: 1,
                },
                client_ts: isoNow(),
                idempotency_key: "fnh-bad",
              },
            ],
          },
        }),
        r,
      );
      const body = r.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body.accepted).toBe(0);
      expect(body.results[0].reason).toBe("invalid_month");
    },
    TIMEOUT_MS,
  );

  it(
    "finyk_prefs: singleton upsert — insert then update; delete rejected",
    async (ctx) => {
      if (!dockerAvailable || !testPool) return ctx.skip();
      await ensureUser("u-fp");

      const t1 = isoNow(-2_000);
      const t2 = isoNow();
      const t3 = isoNow(2_000);

      const r1 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fp",
          body: {
            ops: [
              {
                table: "finyk_prefs",
                op: "insert" as const,
                row: {
                  user_id: "u-fp",
                  prefs_json: { defaultCurrency: "UAH" },
                  monthly_plan_json: { income: "50000", expense: "30000" },
                  show_balance: true,
                },
                client_ts: t1,
                idempotency_key: "fp-insert",
              },
            ],
          },
        }),
        r1,
      );
      expect((r1.body as { accepted: number }).accepted).toBe(1);

      const r2 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fp",
          body: {
            ops: [
              {
                table: "finyk_prefs",
                op: "update" as const,
                row: {
                  user_id: "u-fp",
                  prefs_json: { defaultCurrency: "USD" },
                  monthly_plan_json: { income: "60000", expense: "30000" },
                  show_balance: false,
                },
                client_ts: t2,
                idempotency_key: "fp-update",
              },
            ],
          },
        }),
        r2,
      );
      expect((r2.body as { accepted: number }).accepted).toBe(1);

      const row = await testPool.query<{
        prefs_json: { defaultCurrency: string };
        show_balance: boolean;
      }>(
        `SELECT prefs_json, show_balance FROM finyk_prefs WHERE user_id = $1`,
        ["u-fp"],
      );
      expect(row.rows[0].prefs_json.defaultCurrency).toBe("USD");
      expect(row.rows[0].show_balance).toBe(false);

      const r3 = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-fp",
          body: {
            ops: [
              {
                table: "finyk_prefs",
                op: "delete" as const,
                row: { user_id: "u-fp" },
                client_ts: t3,
                idempotency_key: "fp-delete",
              },
            ],
          },
        }),
        r3,
      );
      const body3 = r3.body as {
        accepted: number;
        results: Array<{ status: string; reason?: string }>;
      };
      expect(body3.accepted).toBe(0);
      expect(body3.results[0].reason).toBe("delete_not_supported");
    },
    TIMEOUT_MS,
  );
});
