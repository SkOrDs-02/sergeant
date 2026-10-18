/**
 * Integration (Testcontainers): soft-delete tombstone-и finyk-таблиць без
 * UUID-PK — data-15, частина Б, міграція 156.
 *
 * Сценарій з аудиту: insert@T0, delete@T2, потім ЗАСТАРІЛИЙ update@T1.
 * Раніше delete був фізичним `DELETE`, і запізнілий upsert воскрешав рядок.
 * Тепер delete лишає tombstone (`deleted_at` + `updated_at = T2`), і
 * застарілий запис відхиляється як `lww_conflict`.
 *
 * Запускається через `vitest.integration.config.ts`; без Docker локально
 * скіпається (у CI Docker обовʼязковий).
 */
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  bootIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
  type IntegrationHarness,
} from "../../../test/createIntegrationApp.js";

const USER_ID = "finyk-soft-delete-user";
const T0 = "2026-10-01T08:00:00.000Z";
const T1 = "2026-10-01T09:00:00.000Z";
const T2 = "2026-10-01T10:00:00.000Z";
const T3 = "2026-10-01T11:00:00.000Z";

let harness: IntegrationHarness | undefined;
let dockerAvailable = false;
let syncV2Push: (req: Request, res: Response) => Promise<void>;
let syncV2Pull: (req: Request, res: Response) => Promise<void>;

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
}): Request & { user: { id: string } } {
  return {
    body: init.body ?? {},
    query: init.query ?? {},
    headers: init.headers ?? {},
    user: { id: USER_ID },
  } as unknown as Request & { user: { id: string } };
}

interface PushResult {
  status: string;
  reason?: string;
}

let keySeq = 0;

async function push(
  table: string,
  op: "insert" | "update" | "delete",
  row: Record<string, unknown>,
  clientTs: string,
): Promise<PushResult> {
  const res = makeRes();
  await syncV2Push(
    makeReq({
      body: {
        ops: [
          {
            table,
            op,
            row: { user_id: USER_ID, ...row },
            client_ts: clientTs,
            idempotency_key: `soft-${(keySeq += 1)}`,
          },
        ],
      },
    }),
    res,
  );
  const body = res.body as { results: PushResult[] };
  return body.results[0] as PushResult;
}

interface Case {
  table: string;
  key: Record<string, unknown>;
  keyWhere: string;
  keyParams: unknown[];
  payload: (v: string) => Record<string, unknown>;
  read: string;
  readValue: (row: Record<string, unknown>) => unknown;
  value: (v: string) => unknown;
}

const CASES: Case[] = [
  {
    table: "finyk_tx_categories",
    key: { transaction_id: "tx-1" },
    keyWhere: "transaction_id = $2",
    keyParams: ["tx-1"],
    payload: (v) => ({ category_id: v }),
    read: "category_id",
    readValue: (r) => r["category_id"],
    value: (v) => v,
  },
  {
    table: "finyk_tx_splits",
    key: { transaction_id: "tx-1" },
    keyWhere: "transaction_id = $2",
    keyParams: ["tx-1"],
    payload: (v) => ({ splits_json: [{ categoryId: v, amount: 100 }] }),
    read: "splits_json",
    readValue: (r) => r["splits_json"],
    value: (v) => [{ categoryId: v, amount: 100 }],
  },
  {
    table: "finyk_mono_debt_links",
    key: { transaction_id: "tx-1" },
    keyWhere: "transaction_id = $2",
    keyParams: ["tx-1"],
    payload: (v) => ({ debt_ids_json: [v] }),
    read: "debt_ids_json",
    readValue: (r) => r["debt_ids_json"],
    value: (v) => [v],
  },
  {
    table: "finyk_networth_history",
    key: { month: "2026-09" },
    keyWhere: "month = $2",
    keyParams: ["2026-09"],
    payload: (v) => ({ networth: Number(v) }),
    read: "networth",
    readValue: (r) => r["networth"],
    value: (v) => Number(v),
  },
];

async function readRow(c: Case): Promise<Record<string, unknown> | undefined> {
  if (!harness) throw new Error("integration harness not booted");
  const res = await harness.pool.query<Record<string, unknown>>(
    `SELECT ${c.read}, updated_at, deleted_at FROM ${c.table}
      WHERE user_id = $1 AND ${c.keyWhere}`,
    [USER_ID, ...c.keyParams],
  );
  return res.rows[0];
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    ({ syncV2Push, syncV2Pull } = await import("../syncV2.js"));
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[finyk soft-delete integration] Skipping: testcontainers unavailable: ${
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
  await seedIntegrationUser(harness.pool, USER_ID);
});

describe.each(CASES)("$table: soft-delete tombstone", (c) => {
  it(
    "insert@T0, delete@T2, stale update@T1 -> lww_conflict, рядок лишається видаленим",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();

      expect(
        await push(c.table, "insert", { ...c.key, ...c.payload("10") }, T0),
      ).toMatchObject({ status: "applied" });
      expect(await push(c.table, "delete", { ...c.key }, T2)).toMatchObject({
        status: "applied",
      });

      // Фізичного DELETE нема: tombstone з updated_at видалення.
      const afterDelete = await readRow(c);
      expect(afterDelete).toBeDefined();
      expect(afterDelete!["deleted_at"]).not.toBeNull();
      expect((afterDelete!["updated_at"] as Date).toISOString()).toBe(T2);

      // Запізнілий upsert (T1 < T2) НЕ воскрешає рядок.
      const stale = await push(
        c.table,
        "update",
        { ...c.key, ...c.payload("20") },
        T1,
      );
      expect(stale).toMatchObject({
        status: "rejected",
        reason: "lww_conflict",
      });
      const afterStale = await readRow(c);
      expect(afterStale!["deleted_at"]).not.toBeNull();
      expect(c.readValue(afterStale!)).toEqual(c.value("10"));
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "новіший за tombstone запис воскрешає рядок (deleted_at скидається)",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();

      await push(c.table, "insert", { ...c.key, ...c.payload("10") }, T0);
      await push(c.table, "delete", { ...c.key }, T2);
      const revived = await push(
        c.table,
        "update",
        { ...c.key, ...c.payload("30") },
        T3,
      );
      expect(revived).toMatchObject({ status: "applied" });

      const row = await readRow(c);
      expect(row!["deleted_at"]).toBeNull();
      expect(c.readValue(row!)).toEqual(c.value("30"));
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "pull віддає tombstone як delete-оп з міткою видалення",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();

      await push(c.table, "insert", { ...c.key, ...c.payload("10") }, T0);
      await push(c.table, "delete", { ...c.key }, T2);

      const res = makeRes();
      await syncV2Pull(
        makeReq({
          query: { since: 0 },
          headers: { "x-origin-device-id": "device-B" },
        }),
        res,
      );
      const body = res.body as {
        ops: Array<{ table: string; op: string; client_ts: string }>;
      };
      const mine = body.ops.filter((o) => o.table === c.table);
      expect(mine.map((o) => o.op)).toEqual(["insert", "delete"]);
      expect(new Date(mine[1]!.client_ts).toISOString()).toBe(T2);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});

describe("експорт даних (GDPR) не віддає tombstone-и", () => {
  it(
    "buildMeExport.finyk містить лише живі рядки чотирьох таблиць",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();
      const { buildMeExport } = await import("../../me/dataRights.js");

      // Живі: category tx-live, splits tx-live. Видалені: tx-dead.
      await push(
        "finyk_tx_categories",
        "insert",
        { transaction_id: "tx-live", category_id: "food" },
        T0,
      );
      await push(
        "finyk_tx_categories",
        "insert",
        { transaction_id: "tx-dead", category_id: "food" },
        T0,
      );
      await push(
        "finyk_tx_categories",
        "delete",
        { transaction_id: "tx-dead" },
        T2,
      );
      await push(
        "finyk_tx_splits",
        "insert",
        { transaction_id: "tx-dead", splits_json: [] },
        T0,
      );
      await push(
        "finyk_tx_splits",
        "delete",
        { transaction_id: "tx-dead" },
        T2,
      );
      await push(
        "finyk_mono_debt_links",
        "insert",
        { transaction_id: "tx-dead", debt_ids_json: ["d1"] },
        T0,
      );
      await push(
        "finyk_mono_debt_links",
        "delete",
        { transaction_id: "tx-dead" },
        T2,
      );
      await push(
        "finyk_networth_history",
        "insert",
        { month: "2026-08", networth: 1 },
        T0,
      );
      await push("finyk_networth_history", "delete", { month: "2026-08" }, T2);

      const exported = await buildMeExport(harness.pool, {
        id: USER_ID,
        email: `${USER_ID}@test.local`,
        name: USER_ID,
        image: null,
        emailVerified: true,
        createdAt: T0,
      });
      const finyk = exported.data.finyk as Record<string, unknown[]>;
      const cats = finyk["finyk_tx_categories"] as Array<{
        transaction_id: string;
      }>;
      expect(cats.map((r) => r.transaction_id)).toEqual(["tx-live"]);
      expect(finyk["finyk_tx_splits"]).toHaveLength(0);
      expect(finyk["finyk_mono_debt_links"]).toHaveLength(0);
      expect(finyk["finyk_networth_history"]).toHaveLength(0);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
