import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../../http/schemas.js";
import {
  bootIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
  type IntegrationHarness,
} from "../../../test/createIntegrationApp.js";

let harness: IntegrationHarness | undefined;
let dockerAvailable = false;
// Динамічні імпорти: `db.js` (його тягне й `applySync.js` через `syncV2-core`)
// читає DATABASE_URL при першому load, а виставляє його `bootIntegrationHarness`.
let applyRoutineEntries: typeof import("./applySync.js").applyRoutineEntries;
let syncV2Push: typeof import("../syncV2.js").syncV2Push;

function routineEntryOp(
  kind: SyncV2Op["op"],
  row: Record<string, unknown>,
): SyncV2Op {
  return { op: kind, table: "routine_entries", row } as SyncV2Op;
}

async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!harness) throw new Error("integration harness not booted");
  const client = await harness.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    ({ applyRoutineEntries } = await import("./applySync.js"));
    ({ syncV2Push } = await import("../syncV2.js"));
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[routine apply integration] Skipping: testcontainers unavailable — ${
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
  await seedIntegrationUser(harness.pool, "routine-user");
});

describe("applyRoutineEntries integration", () => {
  it(
    "persists inserts and soft-deletes through real Postgres",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();

      const insertTs = new Date("2026-07-21T08:00:00.000Z");
      const deleteTs = new Date("2026-07-21T09:00:00.000Z");
      const row = {
        id: "10000000-0000-4000-8000-000000000001",
        user_id: "routine-user",
        name: "drink water",
        completed_at: "2026-07-21T07:30:00.000Z",
      };

      await withClient(async (client) => {
        await expect(
          applyRoutineEntries(
            client,
            routineEntryOp("insert", row),
            "routine-user",
            insertTs,
          ),
        ).resolves.toEqual({ status: "applied" });

        const inserted = await client.query<{
          user_id: string;
          name: string;
          completed_at: Date | null;
          deleted_at: Date | null;
        }>(
          `SELECT user_id, name, completed_at, deleted_at
             FROM routine_entries
            WHERE id = $1`,
          [row.id],
        );
        expect(inserted.rows[0]).toMatchObject({
          user_id: "routine-user",
          name: "drink water",
          deleted_at: null,
        });
        expect(inserted.rows[0]?.completed_at?.toISOString()).toBe(
          "2026-07-21T07:30:00.000Z",
        );

        await expect(
          applyRoutineEntries(
            client,
            routineEntryOp("delete", {
              id: row.id,
              user_id: "routine-user",
            }),
            "routine-user",
            deleteTs,
          ),
        ).resolves.toEqual({ status: "applied" });

        const deleted = await client.query<{ deleted_at: Date | null }>(
          `SELECT deleted_at FROM routine_entries WHERE id = $1`,
          [row.id],
        );
        expect(deleted.rows[0]?.deleted_at?.toISOString()).toBe(
          "2026-07-21T09:00:00.000Z",
        );
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // Регресія audit E-1: toggle→untoggle→toggle. PK `routine_entries`
  // детермінований (`habitId:dateKey`), тож третій чекін бʼє у той самий
  // рядок і мусить його воскресити, а не отримати `tombstoned`.
  it(
    "resurrects a soft-deleted entry on a strictly newer re-check",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();

      const t1 = new Date("2026-07-22T08:00:00.000Z");
      const t2 = new Date("2026-07-22T09:00:00.000Z");
      const t3 = new Date("2026-07-22T10:00:00.000Z");
      const id = "10000000-0000-4000-8000-000000000002";

      await withClient(async (client) => {
        await expect(
          applyRoutineEntries(
            client,
            routineEntryOp("insert", {
              id,
              user_id: "routine-user",
              name: "drink water",
              completed_at: t1.toISOString(),
            }),
            "routine-user",
            t1,
          ),
        ).resolves.toEqual({ status: "applied" });

        await expect(
          applyRoutineEntries(
            client,
            routineEntryOp("delete", { id, user_id: "routine-user" }),
            "routine-user",
            t2,
          ),
        ).resolves.toEqual({ status: "applied" });

        await expect(
          applyRoutineEntries(
            client,
            routineEntryOp("insert", {
              id,
              user_id: "routine-user",
              name: "drink water",
              completed_at: t3.toISOString(),
              deleted_at: null,
            }),
            "routine-user",
            t3,
          ),
        ).resolves.toEqual({ status: "applied" });

        const revived = await client.query<{
          name: string;
          completed_at: Date | null;
          deleted_at: Date | null;
        }>(
          `SELECT name, completed_at, deleted_at FROM routine_entries WHERE id = $1`,
          [id],
        );
        expect(revived.rows[0]).toMatchObject({
          name: "drink water",
          deleted_at: null,
        });
        expect(revived.rows[0]?.completed_at?.toISOString()).toBe(
          t3.toISOString(),
        );
      });
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // data-18: гонка першого INSERT того самого id з двох пристроїв. Пристрій A
  // вставив рядок і ще не закомітився; пристрій B (НОВІШИЙ client_ts) бачить
  // порожній SELECT, його INSERT блокується на unique-індексі й після коміту A
  // падає з 23505. Без ретраю в syncV2 B отримував термінальний
  // `rejected/apply_failed`, і новіша правка губилась назавжди.
  it(
    "first-insert race: newer push wins instead of apply_failed (data-18)",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();
      const pool = harness.pool;

      const id = "10000000-0000-4000-8000-0000000000d8";
      const olderTs = new Date("2026-07-23T08:00:00.000Z");
      const newerTs = new Date("2026-07-23T09:00:00.000Z");
      const rowFor = (name: string, ts: Date) => ({
        id,
        user_id: "routine-user",
        name,
        completed_at: ts.toISOString(),
      });

      const clientA = await pool.connect();
      try {
        // A: вставка без коміту - утримує запис у unique-індексі PK.
        await clientA.query("BEGIN");
        await expect(
          applyRoutineEntries(
            clientA,
            routineEntryOp("insert", rowFor("OLDER", olderTs)),
            "routine-user",
            olderTs,
          ),
        ).resolves.toEqual({ status: "applied" });

        // B: справжній пуш, його INSERT зависає на транзакції A.
        let body: unknown;
        const res = {
          status() {
            return res;
          },
          json(payload: unknown) {
            body = payload;
            return res;
          },
        } as unknown as Response;
        const req = {
          body: {
            ops: [
              {
                table: "routine_entries",
                op: "insert",
                row: rowFor("NEWER", newerTs),
                client_ts: newerTs.toISOString(),
                idempotency_key: "data-18-device-b",
              },
            ],
          },
          query: {},
          headers: { "x-origin-device-id": "device-b" },
          user: { id: "routine-user" },
        } as unknown as Request;
        const pushB = syncV2Push(req, res);

        // Чекаємо, поки B справді впреться в lock A (а не просто стартує).
        const deadline = Date.now() + 15_000;
        for (;;) {
          const waiting = await pool.query(
            `SELECT 1 FROM pg_locks WHERE locktype = 'transactionid' AND NOT granted`,
          );
          if (waiting.rowCount) break;
          if (Date.now() > deadline) {
            throw new Error("push B never blocked on A's uncommitted insert");
          }
          await new Promise((r) => setTimeout(r, 25));
        }

        await clientA.query("COMMIT");
        await pushB;

        expect(body).toMatchObject({
          accepted: 1,
          results: [{ idempotency_key: "data-18-device-b", status: "applied" }],
        });

        const stored = await pool.query<{ name: string }>(
          `SELECT name FROM routine_entries WHERE id = $1`,
          [id],
        );
        expect(stored.rows).toEqual([{ name: "NEWER" }]);

        const log = await pool.query<{
          status: string;
          reject_reason: string | null;
        }>(
          `SELECT status, reject_reason FROM sync_op_log
            WHERE user_id = $1 AND idempotency_key = $2`,
          ["routine-user", "data-18-device-b"],
        );
        expect(log.rows).toEqual([{ status: "applied", reject_reason: null }]);
      } finally {
        await clientA.query("ROLLBACK").catch(() => {});
        clientA.release();
      }
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
