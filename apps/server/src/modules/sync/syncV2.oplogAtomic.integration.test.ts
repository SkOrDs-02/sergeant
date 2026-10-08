/**
 * Integration (реальний Postgres) для двох знахідок аудиту 2026-10-01:
 *
 *  - `data-17` — apply і запис у `sync_op_log` атомарні: якщо журнал не
 *    прийняв оп, доменний рядок НЕ лишається; `U+0000` / одинокий сурогат у
 *    `row` відсікається ДО apply з reason `invalid_text_encoding`.
 *  - `data-48` — відхилений оп не зберігає payload у `sync_op_log.row`, а
 *    ретеншен-поллер чистить лише відхилені рядки й не чіпає `applied`.
 *
 * Той самий каркас, що й `syncV2.integration.test.ts`: Testcontainers, у CI
 * (`CI=1`) без Docker падає, локально скіпається.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { GenericContainer, Wait } from "testcontainers";
import type { StartedTestContainer } from "testcontainers";
import type { Request, Response } from "express";

// Динамічний імпорт: `db.js` читає DATABASE_URL при першому load.
let syncV2Push: typeof import("./syncV2.js").syncV2Push;
let syncV2Pull: typeof import("./syncV2.js").syncV2Pull;
let LogArchivePoller: typeof import("../logRetention/archivePoller.js").LogArchivePoller;
let DEFAULT_ARCHIVE_TABLES: typeof import("../logRetention/archivePoller.js").DEFAULT_ARCHIVE_TABLES;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..", "..", "migrations");
const TIMEOUT_MS = 240_000;

let container: StartedTestContainer | undefined;
let testPool: pg.Pool | undefined;
let dockerAvailable = false;

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
  await testPool!.query(
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

function makeReq(init: {
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  userId: string;
}): Request & { user: { id: string } } {
  return {
    body: init.body ?? {},
    query: init.query ?? {},
    headers: init.headers ?? {},
    user: { id: init.userId },
  } as unknown as Request & { user: { id: string } };
}

type PushBody = {
  accepted: number;
  results: Array<{ idempotency_key: string; status: string; reason?: string }>;
};

beforeAll(async () => {
  try {
    container = await new GenericContainer("pgvector/pgvector:pg17")
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
    const uri = `postgresql://hub:hub@${container.getHost()}:${container.getMappedPort(5432)}/hub_test`;
    process.env["DATABASE_URL"] = uri;
    ({ syncV2Push, syncV2Pull } = await import("./syncV2.js"));
    ({ LogArchivePoller, DEFAULT_ARCHIVE_TABLES } =
      await import("../logRetention/archivePoller.js"));
    testPool = new pg.Pool({ connectionString: uri, max: 5 });
    await runMigrations(testPool);
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[syncV2 oplogAtomic integration] Skipping: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}, TIMEOUT_MS);

afterAll(async () => {
  if (testPool) await testPool.end().catch(() => {});
  if (container) await container.stop().catch(() => {});
}, TIMEOUT_MS);

beforeEach(async () => {
  if (!testPool || !dockerAvailable) return;
  await testPool.query(
    `TRUNCATE sync_op_log, sync_audit_log, routine_entries RESTART IDENTITY CASCADE`,
  );
});

const ENTRY_ID = "habit-1:2026-10-01";

function entryOp(
  userId: string,
  key: string,
  name: string,
  clientTs: string,
  extra: Record<string, unknown> = {},
) {
  return {
    table: "routine_entries",
    op: "insert" as const,
    row: { id: ENTRY_ID, user_id: userId, name, ...extra },
    client_ts: clientTs,
    idempotency_key: key,
  };
}

async function entryRows(): Promise<Array<{ name: string }>> {
  const r = await testPool!.query<{ name: string }>(
    `SELECT name FROM routine_entries WHERE id = $1`,
    [ENTRY_ID],
  );
  return r.rows;
}

describe("syncV2Push · data-17 (apply і журнал атомарні)", () => {
  it(
    "U+0000 у полі, яке apply не пише в таблицю: відхилено до apply, рядка немає",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await ensureUser("u-nul");
      const ts = new Date(Date.now() - 60_000).toISOString();

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-nul",
          body: {
            ops: [
              entryOp("u-nul", "nul-1", "applied but not logged", ts, {
                client_extra: "a\u0000b",
              }),
            ],
          },
        }),
        res,
      );

      const body = res.body as PushBody;
      expect(body.accepted).toBe(0);
      expect(body.results[0]).toMatchObject({
        status: "rejected",
        reason: "invalid_text_encoding",
      });
      expect(await entryRows()).toHaveLength(0);

      // Відхилений оп лишив у журналі ключ + причину, без payload.
      const log = await testPool!.query<{
        status: string;
        reject_reason: string;
        row: unknown;
      }>(
        `SELECT status, reject_reason, row FROM sync_op_log WHERE user_id = $1`,
        ["u-nul"],
      );
      expect(log.rows).toEqual([
        {
          status: "rejected",
          reject_reason: "invalid_text_encoding",
          row: {},
        },
      ]);
    },
    TIMEOUT_MS,
  );

  it(
    "одинокий сурогат у збереженій назві (обрізаний емодзі): рядка немає, існуючий не змінено",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await ensureUser("u-sur");
      const t1 = new Date(Date.now() - 120_000).toISOString();
      const t2 = new Date(Date.now() - 60_000).toISOString();

      const first = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-sur",
          body: { ops: [entryOp("u-sur", "sur-v1", "v1", t1)] },
        }),
        first,
      );
      expect((first.body as PushBody).accepted).toBe(1);

      const broken = "Пробіжка 🏃".slice(0, "Пробіжка 🏃".length - 1);
      const second = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-sur",
          body: { ops: [entryOp("u-sur", "sur-v2", broken, t2)] },
        }),
        second,
      );
      expect((second.body as PushBody).results[0]).toMatchObject({
        status: "rejected",
        reason: "invalid_text_encoding",
      });
      // Фантомної версії немає: LWW-стан лишається v1.
      expect(await entryRows()).toEqual([{ name: "v1" }]);
    },
    TIMEOUT_MS,
  );

  it(
    "запис у журнал падає ПІСЛЯ apply (U+0000 в origin_device_id): доменний рядок відкочено, сусід доїхав",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await ensureUser("u-roll");
      const ts = new Date(Date.now() - 60_000).toISOString();

      // `U+0000` в TEXT-колонці `origin_device_id` проходить усю валідацію
      // (її ми не перевіряємо) і валить INSERT у журнал уже після apply.
      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-roll",
          headers: { "x-origin-device-id": "dev\u0000ice" },
          body: { ops: [entryOp("u-roll", "roll-1", "must not persist", ts)] },
        }),
        res,
      );

      const body = res.body as PushBody;
      expect(body.accepted).toBe(0);
      expect(body.results[0]).toMatchObject({
        status: "rejected",
        reason: "oplog_write_failed",
      });
      // Головне: apply відкочено разом із відмовою журналу.
      expect(await entryRows()).toHaveLength(0);
      const log = await testPool!.query(
        `SELECT 1 FROM sync_op_log WHERE user_id = $1`,
        ["u-roll"],
      );
      expect(log.rows).toHaveLength(0);
    },
    TIMEOUT_MS,
  );
});

describe("syncV2Push · data-48 (відхилений оп без payload)", () => {
  it(
    "невідома таблиця з великим row: у журналі {} , pull віддає лише applied",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await ensureUser("u-junk");
      const ts = new Date(Date.now() - 60_000).toISOString();

      const res = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-junk",
          headers: { "x-origin-device-id": "dev-A" },
          body: {
            ops: [
              {
                table: "zz_audit_junk",
                op: "insert",
                row: { blob: "x".repeat(50_000) },
                client_ts: ts,
                idempotency_key: "junk-1",
              },
              entryOp("u-junk", "ok-1", "kept", ts),
            ],
          },
        }),
        res,
      );
      const body = res.body as PushBody;
      expect(body.results.map((r) => r.status)).toEqual([
        "rejected",
        "applied",
      ]);

      const log = await testPool!.query<{
        idempotency_key: string;
        status: string;
        row_len: number;
      }>(
        `SELECT idempotency_key, status, length(row::text) AS row_len
           FROM sync_op_log WHERE user_id = $1 ORDER BY id`,
        ["u-junk"],
      );
      expect(log.rows[0]).toMatchObject({
        idempotency_key: "junk-1",
        status: "rejected",
        row_len: 2, // '{}'
      });
      expect(log.rows[1]!.status).toBe("applied");
      expect(log.rows[1]!.row_len).toBeGreaterThan(20);

      // Анти-реплей працює: повтор того самого ключа не застосовується
      // заново, а віддає збережену відмову.
      const replay = makeRes();
      await syncV2Push(
        makeReq({
          userId: "u-junk",
          body: {
            ops: [
              {
                table: "zz_audit_junk",
                op: "insert",
                row: { blob: "x" },
                client_ts: ts,
                idempotency_key: "junk-1",
              },
            ],
          },
        }),
        replay,
      );
      expect((replay.body as PushBody).results[0]).toMatchObject({
        status: "rejected",
        reason: "table_not_allowed",
      });

      // Pull з іншого пристрою бачить тільки applied.
      const pull = makeRes();
      await syncV2Pull(
        makeReq({
          userId: "u-junk",
          headers: { "x-origin-device-id": "dev-B" },
          query: { since: "0" },
        }),
        pull,
      );
      const pulled = pull.body as { ops: Array<{ table: string }> };
      expect(pulled.ops.map((o) => o.table)).toEqual(["routine_entries"]);
    },
    TIMEOUT_MS,
  );
});

describe("LogArchivePoller · sync_op_log (data-48)", () => {
  it(
    "видаляє старі rejected, не чіпає applied і свіжі rejected",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await ensureUser("u-ret");

      const insert = (
        key: string,
        status: "applied" | "rejected",
        ageDays: number,
      ) =>
        testPool!.query(
          `INSERT INTO sync_op_log
             (user_id, idempotency_key, table_name, op, row, client_ts,
              status, reject_reason, server_ts)
           VALUES ($1, $2, 'routine_entries', 'insert', $3::jsonb, now(),
                   $4, $5, now() - ($6::int * INTERVAL '1 day'))`,
          [
            "u-ret",
            key,
            status === "applied" ? '{"id":"x"}' : "{}",
            status,
            status === "rejected" ? "table_not_allowed" : null,
            ageDays,
          ],
        );
      await insert("old-rejected", "rejected", 40);
      await insert("old-rejected-2", "rejected", 31);
      await insert("fresh-rejected", "rejected", 5);
      await insert("old-applied", "applied", 400);
      await insert("fresh-applied", "applied", 1);

      const uploads: string[] = [];
      const fetchImpl = (async (url: unknown, init?: RequestInit) => {
        uploads.push(String(url));
        // Завантажене не повинно містити payload `row`.
        const body = init?.body as Buffer | undefined;
        expect(body).toBeDefined();
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => "",
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const poller = new LogArchivePoller({
        pool: testPool!,
        enabled: true,
        retentionDays: 365, // глобальний TTL не має впливати на sync_op_log
        bucket: "test-bucket",
        // Продакшн-специфікація, а не копія: зміна її предиката має ловитись тут.
        tables: DEFAULT_ARCHIVE_TABLES.filter((t) => t.table === "sync_op_log"),
        gcsDeps: { getAccessToken: async () => "tok", fetchImpl },
      });

      const result = await poller.runOnce();
      expect(result.archived["sync_op_log"]).toBe(2);
      expect(uploads).toHaveLength(1);

      const left = await testPool!.query<{ idempotency_key: string }>(
        `SELECT idempotency_key FROM sync_op_log ORDER BY id`,
      );
      expect(left.rows.map((r) => r.idempotency_key).sort()).toEqual([
        "fresh-applied",
        "fresh-rejected",
        "old-applied",
      ]);
    },
    TIMEOUT_MS,
  );
});
