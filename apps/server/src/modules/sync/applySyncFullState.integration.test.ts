import type { PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { SyncV2Op } from "../../http/schemas.js";
import {
  bootIntegrationHarness,
  INTEGRATION_TIMEOUT_MS,
  seedIntegrationUser,
  shutdownIntegrationHarness,
  truncateIntegrationTables,
  type IntegrationHarness,
} from "../../test/createIntegrationApp.js";
import type { AppliedStatus } from "./syncV2-types.js";
import { applyFinykTxCategories } from "./finyk/applySync.js";
import { applyRoutineStreaks } from "./routine/applySync.js";
import {
  applyRoutineHabits,
  applyRoutinePrefs,
} from "./routine/applySyncFullState.js";

// Регресія гонки LWW: SELECT без блокування → порівняння в JS → безумовний
// upsert. Новіший пуш тримає рядок незакоміченим, старіший у цей час читає
// ще стару версію, проходить JS-guard і чекає на row lock. Після коміту
// новішого старіший дописував поверх. Тепер strict-newer предикат стоїть у
// самому SQL, Postgres перевіряє його на свіжій версії рядка після lock wait.

const USER_ID = "lww-race-user";
const T0 = new Date("2026-07-10T08:00:00.000Z");
const T_OLDER = new Date("2026-07-10T09:00:00.000Z");
const T_NEWER = new Date("2026-07-10T10:00:00.000Z");

let harness: IntegrationHarness | undefined;
let dockerAvailable = false;

function op(
  table: string,
  row: Record<string, unknown>,
  kind: SyncV2Op["op"] = "update",
): SyncV2Op {
  return { op: kind, table, row } as SyncV2Op;
}

type Apply = (
  client: PoolClient,
  op: SyncV2Op,
  userId: string,
  clientTs: Date,
) => Promise<AppliedStatus>;

// Новіший пуш застосовується першим і тримає транзакцію відкритою, старіший
// стартує поки той не закомічений, потім новіший комітить.
async function raceOlderAgainstNewer(
  apply: Apply,
  newer: SyncV2Op,
  older: SyncV2Op,
): Promise<{ newer: AppliedStatus; older: AppliedStatus }> {
  if (!harness) throw new Error("integration harness not booted");
  const a = await harness.pool.connect();
  const b = await harness.pool.connect();
  try {
    await a.query("BEGIN");
    const newerRes = await apply(a, newer, USER_ID, T_NEWER);

    await b.query("BEGIN");
    const olderPending = apply(b, older, USER_ID, T_OLDER);
    // Дати старішому дійти до row lock, поки новіший ще не закомічений.
    await new Promise((r) => setTimeout(r, 300));

    await a.query("COMMIT");
    const olderRes = await olderPending;
    await b.query("COMMIT");
    return { newer: newerRes, older: olderRes };
  } finally {
    a.release();
    b.release();
  }
}

beforeAll(async () => {
  try {
    harness = await bootIntegrationHarness({ app: false });
    dockerAvailable = true;
  } catch (e) {
    if (process.env["CI"]) throw e;
    console.warn(
      `[full-state LWW race integration] Skipping: testcontainers unavailable: ${
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

describe("full-state LWW under concurrent pushes", () => {
  it(
    "user-PK upsert: older push committed after newer one does not overwrite it",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();
      const pool = harness.pool;

      const seed = await pool.connect();
      try {
        await applyRoutinePrefs(
          seed,
          op("routine_prefs", { user_id: USER_ID, data: { v: "t0" } }),
          USER_ID,
          T0,
        );
      } finally {
        seed.release();
      }

      const res = await raceOlderAgainstNewer(
        applyRoutinePrefs,
        op("routine_prefs", { user_id: USER_ID, data: { v: "newer" } }),
        op("routine_prefs", { user_id: USER_ID, data: { v: "older" } }),
      );
      expect(res.newer).toEqual({ status: "applied" });
      expect(res.older).toEqual({ status: "rejected", reason: "lww_conflict" });

      const row = await pool.query<{ data: { v: string }; updated_at: Date }>(
        `SELECT data, updated_at FROM routine_prefs WHERE user_id = $1`,
        [USER_ID],
      );
      expect(row.rows[0]?.data).toEqual({ v: "newer" });
      expect(row.rows[0]?.updated_at.toISOString()).toBe(T_NEWER.toISOString());
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "UUID-PK update: older push committed after newer one does not overwrite it",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();
      const pool = harness.pool;
      const id = "20000000-0000-4000-8000-000000000001";
      const habit = (name: string) =>
        op("routine_habits", { id, user_id: USER_ID, name });

      const seed = await pool.connect();
      try {
        await applyRoutineHabits(seed, habit("t0"), USER_ID, T0);
      } finally {
        seed.release();
      }

      const res = await raceOlderAgainstNewer(
        applyRoutineHabits,
        habit("newer"),
        habit("older"),
      );
      expect(res.newer).toEqual({ status: "applied" });
      expect(res.older).toEqual({ status: "rejected", reason: "lww_conflict" });

      const row = await pool.query<{ name: string; updated_at: Date }>(
        `SELECT name, updated_at FROM routine_habits WHERE id = $1`,
        [id],
      );
      expect(row.rows[0]?.name).toBe("newer");
      expect(row.rows[0]?.updated_at.toISOString()).toBe(T_NEWER.toISOString());
    },
    INTEGRATION_TIMEOUT_MS,
  );

  it(
    "hard delete: older delete committed after newer upsert does not remove the row",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();
      const pool = harness.pool;
      const txRow = (categoryId?: string) => ({
        user_id: USER_ID,
        transaction_id: "tx-race-1",
        ...(categoryId ? { category_id: categoryId } : {}),
      });

      const seed = await pool.connect();
      try {
        await applyFinykTxCategories(
          seed,
          op("finyk_tx_categories", txRow("cat-t0"), "insert"),
          USER_ID,
          T0,
        );
      } finally {
        seed.release();
      }

      const res = await raceOlderAgainstNewer(
        applyFinykTxCategories,
        op("finyk_tx_categories", txRow("cat-newer")),
        op("finyk_tx_categories", txRow(), "delete"),
      );
      expect(res.newer).toEqual({ status: "applied" });
      expect(res.older).toEqual({ status: "rejected", reason: "lww_conflict" });

      const row = await pool.query<{ category_id: string }>(
        `SELECT category_id FROM finyk_tx_categories
          WHERE user_id = $1 AND transaction_id = $2`,
        [USER_ID, "tx-race-1"],
      );
      expect(row.rows[0]?.category_id).toBe("cat-newer");
    },
    INTEGRATION_TIMEOUT_MS,
  );

  // `routine_streaks` не має `updated_at`: LWW іде проти `sync_op_log`, який
  // пуш дописує після apply. Обгортка відтворює цей порядок, як у syncV2Push.
  it(
    "routine_streaks: older push committed after newer one does not overwrite it",
    async (ctx) => {
      if (!harness || !dockerAvailable) return ctx.skip();
      const pool = harness.pool;
      const streaksAndLog: Apply = async (c, o, u, ts) => {
        const res = await applyRoutineStreaks(c, o, u, ts);
        if (res.status === "applied") {
          await c.query(
            `INSERT INTO sync_op_log
               (user_id, idempotency_key, table_name, op, row, client_ts, status)
             VALUES ($1, $2, 'routine_streaks', $3, $4, $5, 'applied')`,
            [u, `streaks-${ts.toISOString()}`, o.op, JSON.stringify(o.row), ts],
          );
        }
        return res;
      };
      const streaks = (current: number) =>
        op("routine_streaks", {
          user_id: USER_ID,
          current_streak: current,
          longest_streak: current,
        });

      const res = await raceOlderAgainstNewer(
        streaksAndLog,
        streaks(7),
        streaks(3),
      );
      expect(res.newer).toEqual({ status: "applied" });
      expect(res.older).toEqual({ status: "rejected", reason: "lww_conflict" });

      const row = await pool.query<{ current_streak: number }>(
        `SELECT current_streak FROM routine_streaks WHERE user_id = $1`,
        [USER_ID],
      );
      expect(row.rows[0]?.current_streak).toBe(7);
    },
    INTEGRATION_TIMEOUT_MS,
  );
});
