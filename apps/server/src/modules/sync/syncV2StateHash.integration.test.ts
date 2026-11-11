/**
 * `GET /api/v2/sync/state-hash` на справжньому Postgres (ADR-0106, крок 1).
 *
 * Перевіряє те, що мок пулу перевірити не може: SQL часу (`floor(epoch*1000)`
 * відкидає субмілісекунди `timestamptz`), складений PK, фільтр за
 * користувачем, `as_of_op_id` лише по `applied`, і що хеш сервера дорівнює
 * результату спільного канонізатора на тих самих даних — тобто клієнт, що
 * рахує той самий `computeStateHash`, отримає той самий рядок.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  SYNC_STATE_HASH_TABLE_PKS,
  computeStateHash,
  joinStateHashPk,
} from "@sergeant/shared";
import {
  bootIntegrationHarness,
  shutdownIntegrationHarness,
  seedIntegrationUser,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";

let syncV2StateHash: typeof import("./syncV2StateHash.js").syncV2StateHash;
let harness: IntegrationHarness | undefined;
let dockerAvailable = false;

const USER = "user-state-hash-a";
const OTHER = "user-state-hash-b";

interface Body {
  table: string;
  as_of_op_id: number;
  total: { hash: string; count: number };
  buckets: Array<{ bucket: number; hash: string; count: number }>;
}

async function callStateHash(userId: string, table: unknown): Promise<Body> {
  let body: unknown;
  const res = {
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  await syncV2StateHash(
    { query: { table }, user: { id: userId } } as unknown as Request,
    res,
  );
  return body as Body;
}

async function insertWorkout(
  userId: string,
  id: string,
  updatedAt: string,
  deletedAt: string | null = null,
  note = "",
): Promise<void> {
  await harness!.pool.query(
    `INSERT INTO fizruk_workouts (id, user_id, started_at, note, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $3, $5)
     ON CONFLICT (user_id, id) DO UPDATE
       SET updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at,
           note = EXCLUDED.note`,
    [id, userId, updatedAt, note, deletedAt],
  );
}

async function insertOpLog(
  userId: string,
  key: string,
  status: "applied" | "rejected",
): Promise<number> {
  const r = await harness!.pool.query<{ id: string }>(
    `INSERT INTO sync_op_log (user_id, table_name, op, row, client_ts, status, idempotency_key)
     VALUES ($1, 'fizruk_workouts', 'insert', '{}'::jsonb, now(), $2, $3)
     RETURNING id`,
    [userId, status, key],
  );
  return Number(r.rows[0]!.id);
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    ({ syncV2StateHash } = await import("./syncV2StateHash.js"));
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[syncV2StateHash] Skipping: testcontainers unavailable — ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!harness || !dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER);
  await seedIntegrationUser(harness.pool, OTHER);
});

describe("syncV2StateHash (Postgres)", () => {
  it("хеш дорівнює спільному канонізатору; субмілісекунди відкинуто", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    // `.123456` мікросекунд: у хеш має піти 123 мс, а не округлення до 124.
    await insertWorkout(USER, "w-1", "2026-10-01T10:00:00.123456Z");
    await insertWorkout(
      USER,
      "w-2",
      "2026-10-01T11:00:00.999900Z",
      "2026-10-02T08:00:00.000700Z",
    );

    const body = await callStateHash(USER, "fizruk_workouts");
    const expected = computeStateHash([
      {
        pk: "w-1",
        updated_at_ms: Date.parse("2026-10-01T10:00:00.123Z"),
        deleted_at_ms: null,
      },
      {
        pk: "w-2",
        updated_at_ms: Date.parse("2026-10-01T11:00:00.999Z"),
        deleted_at_ms: Date.parse("2026-10-02T08:00:00.000Z"),
      },
    ]);
    expect(body.table).toBe("fizruk_workouts");
    expect(body.total).toEqual(expected.total);
    expect(body.buckets).toEqual(expected.buckets);
    expect(typeof body.as_of_op_id).toBe("number");
  });

  it("tombstone і updated_at змінюють хеш, payload — ні", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await insertWorkout(USER, "w-1", "2026-10-01T10:00:00.000Z");
    const base = (await callStateHash(USER, "fizruk_workouts")).total.hash;

    await insertWorkout(
      USER,
      "w-1",
      "2026-10-01T10:00:00.000Z",
      null,
      "нотатка",
    );
    expect((await callStateHash(USER, "fizruk_workouts")).total.hash).toBe(
      base,
    );

    await insertWorkout(
      USER,
      "w-1",
      "2026-10-01T10:00:00.000Z",
      "2026-10-01T12:00:00.000Z",
    );
    const tomb = (await callStateHash(USER, "fizruk_workouts")).total;
    expect(tomb.hash).not.toBe(base);
    expect(tomb.count).toBe(1);

    await insertWorkout(USER, "w-1", "2026-10-01T10:00:00.001Z");
    expect((await callStateHash(USER, "fizruk_workouts")).total.hash).not.toBe(
      base,
    );
  });

  it("рядки й оп-и іншого користувача не входять", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await insertWorkout(USER, "w-own", "2026-10-01T10:00:00.000Z");
    const before = await callStateHash(USER, "fizruk_workouts");
    const ownOp = await insertOpLog(USER, "k-own", "applied");

    await insertWorkout(OTHER, "w-foreign", "2026-10-01T10:00:00.000Z");
    await insertOpLog(OTHER, "k-foreign", "applied");

    const after = await callStateHash(USER, "fizruk_workouts");
    expect(after.total).toEqual(before.total);
    expect(after.total.count).toBe(1);
    expect(after.as_of_op_id).toBe(ownOp);
  });

  it("as_of_op_id: 0 без оп-ів, rejected не рахується", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    expect((await callStateHash(USER, "fizruk_workouts")).as_of_op_id).toBe(0);
    const applied = await insertOpLog(USER, "k-1", "applied");
    await insertOpLog(USER, "k-2", "rejected");
    expect((await callStateHash(USER, "fizruk_workouts")).as_of_op_id).toBe(
      applied,
    );
  });

  it("складений PK: ключ без user_id (date_key)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    await harness!.pool.query(
      `INSERT INTO fizruk_wellbeing (user_id, date_key, updated_at)
       VALUES ($1, '2026-10-01', '2026-10-01T09:00:00.000Z')`,
      [USER],
    );
    const body = await callStateHash(USER, "fizruk_wellbeing");
    const expected = computeStateHash([
      {
        pk: joinStateHashPk(["2026-10-01"]),
        updated_at_ms: Date.parse("2026-10-01T09:00:00.000Z"),
        deleted_at_ms: null,
      },
    ]);
    expect(body.total).toEqual(expected.total);
  });

  it("SQL валідний для КОЖНОЇ таблиці allowlist (PK і deleted_at збігаються зі схемою)", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    for (const table of Object.keys(SYNC_STATE_HASH_TABLE_PKS)) {
      const body = await callStateHash(USER, table);
      expect(body.table, table).toBe(table);
      expect(body.total.count, table).toBe(0);
    }
  });

  it("таблиця поза allowlist — 400 STATE_HASH_TABLE_NOT_ALLOWED", async (ctx) => {
    if (!dockerAvailable) return ctx.skip();
    for (const table of ["nutrition_meals", "routine_streaks", undefined]) {
      await expect(callStateHash(USER, table)).rejects.toMatchObject({
        status: 400,
        code: "STATE_HASH_TABLE_NOT_ALLOWED",
      });
    }
  });
});
