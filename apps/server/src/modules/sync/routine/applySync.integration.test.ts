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
import { applyRoutineEntries } from "./applySync.js";

let harness: IntegrationHarness | undefined;
let dockerAvailable = false;

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
});
