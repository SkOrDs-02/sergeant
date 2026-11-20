/**
 * Integration (реальний Postgres) для міграції 176: `done` і `set_type`
 * підходу Фізрука через push → таблиця → pull → snapshot. Юніт-пара —
 * `setDoneFields.sync.test.ts` (фейк-клієнт); тут перевіряємо те, чого фейк
 * не покаже: прапорець присутності на справжньому UPDATE, тип колонки
 * (boolean, не рядок `t`/`f`) у pull і snapshot, CHECK міграції, ізоляцію
 * між користувачами.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";

import {
  bootIntegrationHarness,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
  INTEGRATION_TIMEOUT_MS,
  type IntegrationHarness,
} from "../../../test/createIntegrationApp.js";

// `db.js` будує пул з env при першому імпорті — тому динамічно після boot.
let syncV2Push: typeof import("../syncV2.js").syncV2Push;
let syncV2Pull: typeof import("../syncV2.js").syncV2Pull;
let readSnapshotPage: typeof import("../syncV2Snapshot.js").readSnapshotPage;

let harness: IntegrationHarness;
let dockerAvailable = false;

const USER_A = "u_fz_setdone_a";
const USER_B = "u_fz_setdone_b";
const ITEM_A = "40000000-0000-4000-8000-000000000011";
const SET_A = "40000000-0000-4000-8000-000000000012";

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    ({ syncV2Push, syncV2Pull } = await import("../syncV2.js"));
    ({ readSnapshotPage } = await import("../syncV2Snapshot.js"));
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      "[fizruk set done/type integration] Skipping:",
      e instanceof Error ? e.message : String(e),
    );
  }
}, INTEGRATION_TIMEOUT_MS);

afterAll(async () => {
  if (dockerAvailable) await shutdownIntegrationHarness();
}, INTEGRATION_TIMEOUT_MS);

beforeEach(async () => {
  if (!dockerAvailable) return;
  await truncateIntegrationTables(harness.pool);
  await seedIntegrationUser(harness.pool, USER_A);
  await seedIntegrationUser(harness.pool, USER_B);
});

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

let tick = 0;
function ts(): string {
  tick += 1;
  return new Date(Date.now() - 60_000 + tick * 1_000).toISOString();
}

interface PushResult {
  status: string;
  reason?: string;
}

async function push(
  userId: string,
  ops: Array<{
    table: string;
    op: "insert" | "update";
    row: Record<string, unknown>;
  }>,
): Promise<PushResult[]> {
  const res = makeRes();
  await syncV2Push(
    {
      body: {
        ops: ops.map((o) => {
          const clientTs = ts();
          return {
            ...o,
            client_ts: clientTs,
            idempotency_key: `k-${userId}-${tick}-${o.table}`,
          };
        }),
      },
      query: {},
      headers: {},
      user: { id: userId },
    } as unknown as Request,
    res as unknown as Response,
  );
  expect(res.statusCode).toBe(200);
  return (res.body as { results: PushResult[] }).results;
}

function setRow(userId: string, extra: Record<string, unknown> = {}) {
  return {
    id: SET_A,
    user_id: userId,
    workout_item_id: ITEM_A,
    weight_kg: 60,
    reps: 8,
    sort_order: 0,
    ...extra,
  };
}

async function seedParents(userId: string): Promise<void> {
  const results = await push(userId, [
    {
      table: "fizruk_workouts",
      op: "insert",
      row: {
        id: "40000000-0000-4000-8000-000000000010",
        user_id: userId,
        started_at: new Date().toISOString(),
      },
    },
    {
      table: "fizruk_workout_items",
      op: "insert",
      row: {
        id: ITEM_A,
        user_id: userId,
        workout_id: "40000000-0000-4000-8000-000000000010",
        exercise_id: "ex-1",
        name_uk: "Присідання",
      },
    },
  ]);
  expect(results.map((r) => r.status)).toEqual(["applied", "applied"]);
}

async function readSet(): Promise<{ done: unknown; set_type: unknown }> {
  const { rows } = await harness.pool.query<{
    done: unknown;
    set_type: unknown;
  }>(`SELECT done, set_type FROM fizruk_workout_sets WHERE id = $1`, [SET_A]);
  return rows[0]!;
}

describe("fizruk sync: done і set_type підходу на реальній БД (міграція 176)", () => {
  it(
    "новий клієнт ставить і знімає; старий клієнт без ключів не затирає",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await seedParents(USER_A);

      // Новий клієнт: незроблена розминка.
      expect(
        await push(USER_A, [
          {
            table: "fizruk_workout_sets",
            op: "insert",
            row: setRow(USER_A, { done: false, set_type: "warmup" }),
          },
        ]),
      ).toEqual([expect.objectContaining({ status: "applied" })]);
      expect(await readSet()).toEqual({ done: false, set_type: "warmup" });

      // Старий клієнт (без ключів) змінює вагу: прапорець і тип лишаються.
      await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "update",
          row: setRow(USER_A, { weight_kg: 62.5 }),
        },
      ]);
      expect(await readSet()).toEqual({ done: false, set_type: "warmup" });

      // Новий клієнт відмічає (SQLite-форма 1) і міняє тип.
      await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "update",
          row: setRow(USER_A, { done: 1, set_type: "failure" }),
        },
      ]);
      expect(await readSet()).toEqual({ done: true, set_type: "failure" });

      // Ключ із null — свідоме зняття.
      await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "update",
          row: setRow(USER_A, { done: null, set_type: null }),
        },
      ]);
      expect(await readSet()).toEqual({ done: null, set_type: null });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "невідомий тип і невалідний done відхиляються, колонки не змінюються",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await seedParents(USER_A);
      await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "insert",
          row: setRow(USER_A, { done: true, set_type: "drop" }),
        },
      ]);

      const results = await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "update",
          row: setRow(USER_A, { set_type: "superset" }),
        },
        {
          table: "fizruk_workout_sets",
          op: "update",
          row: setRow(USER_A, { done: "t" }),
        },
      ]);
      expect(results).toEqual([
        expect.objectContaining({
          status: "rejected",
          reason: "invalid_set_type",
        }),
        expect.objectContaining({ status: "rejected", reason: "invalid_done" }),
      ]);
      expect(await readSet()).toEqual({ done: true, set_type: "drop" });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "pull і snapshot віддають done як JSON boolean, set_type рядком",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await seedParents(USER_A);
      await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "insert",
          row: setRow(USER_A, { done: false, set_type: "warmup" }),
        },
      ]);

      const res = makeRes();
      await syncV2Pull(
        {
          query: { since: "0" },
          headers: { "x-origin-device-id": "other-device" },
          user: { id: USER_A },
        } as unknown as Request,
        res as unknown as Response,
      );
      expect(res.statusCode).toBe(200);
      const ops = (
        res.body as {
          ops: Array<{ table: string; row: Record<string, unknown> }>;
        }
      ).ops.filter((o) => o.table === "fizruk_workout_sets");
      expect(ops).toHaveLength(1);
      expect(ops[0]!.row["done"]).toBe(false);
      expect(ops[0]!.row["set_type"]).toBe("warmup");

      const client = await harness.pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const page = await readSnapshotPage(client, USER_A, {
          cursor: null,
          asOfOpId: undefined,
          limit: 500,
          budget: 2_097_152,
          tables: ["fizruk_workout_sets"],
        });
        await client.query("COMMIT");
        expect(page.ops).toHaveLength(1);
        expect(page.ops[0]!.row["done"]).toBe(false);
        expect(page.ops[0]!.row["set_type"]).toBe("warmup");
      } finally {
        client.release();
      }
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "B не змінює done / set_type підходу A тим самим id",
    async (ctx) => {
      if (!dockerAvailable) return ctx.skip();
      await seedParents(USER_A);
      await push(USER_A, [
        {
          table: "fizruk_workout_sets",
          op: "insert",
          row: setRow(USER_A, { done: false, set_type: "warmup" }),
        },
      ]);

      const results = await push(USER_B, [
        {
          table: "fizruk_workout_sets",
          op: "update",
          row: setRow(USER_B, { done: true, set_type: "drop" }),
        },
      ]);
      expect(results[0]!.status).toBe("rejected");
      expect(await readSet()).toEqual({ done: false, set_type: "warmup" });
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
