import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __clearFinykDualWriteContextForTests,
  applyFinykDualWriteOps,
  dualWriteFinykState,
  isFinykDualWriteRegistered,
  registerFinykDualWriteContext,
  triggerFinykDualWrite,
  type FinykDualWriteContext,
  type FinykDualWriteState,
} from "../index.js";
import { EMPTY_FINYK_STATE } from "../diff.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const USER_ID = "u-1";
const NOW = "2026-05-04T00:00:00.000Z";
const LATER = "2026-05-05T00:00:00.000Z";

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  __clearFinykDualWriteContextForTests();
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
});

function makeCtx(
  overrides: Partial<FinykDualWriteContext> = {},
): FinykDualWriteContext {
  return {
    isEnabled: () => true,
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    getNow: () => NOW,
    ...overrides,
  };
}

describe("Finyk dual-write — applyFinykDualWriteOps", () => {
  it("inserts hidden_accounts row on id-upsert", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts",
          entry: { id: "acc-1" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    const rows = await handle.client.all<{
      user_id: string;
      account_id: string;
      deleted_at: string | null;
    }>("SELECT user_id, account_id, deleted_at FROM finyk_hidden_accounts");
    expect(rows).toEqual([
      { user_id: USER_ID, account_id: "acc-1", deleted_at: null },
    ]);
  });

  it("soft-deletes hidden_accounts row on id-delete (LWW)", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts",
          entry: { id: "acc-1" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await applyFinykDualWriteOps(
      handle.client,
      [{ kind: "id-delete", table: "finyk_hidden_accounts", id: "acc-1" }],
      { userId: USER_ID, clientTs: LATER },
    );
    const rows = await handle.client.all<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM finyk_hidden_accounts WHERE account_id = ?",
      ["acc-1"],
    );
    expect(rows[0]?.deleted_at).not.toBeNull();
  });

  it("upserts per-row blob with data_json (finyk_budgets)", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_budgets",
          entry: {
            id: "11111111-1111-1111-1111-111111111111",
            dataJson:
              '{"id":"11111111-1111-1111-1111-111111111111","amount":100}',
          },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    const rows = await handle.client.all<{
      id: string;
      data_json: string;
    }>("SELECT id, data_json FROM finyk_budgets");
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.data_json)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      amount: 100,
    });
  });

  it("hard-deletes per-tx category mapping on tx-category-delete", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "tx-category-upsert",
          entry: { transactionId: "tx-1", categoryId: "c-1" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await applyFinykDualWriteOps(
      handle.client,
      [{ kind: "tx-category-delete", transactionId: "tx-1" }],
      { userId: USER_ID, clientTs: LATER },
    );
    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM finyk_tx_categories",
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects invalid networth month silently (no row inserted)", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "networth-upsert",
          entry: { month: "not-a-month", networth: 100 },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM finyk_networth_history",
    );
    expect(rows).toHaveLength(0);
  });

  it("upserts singleton prefs row (one per user)", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "prefs-upsert",
          prefs: { monthlyPlanJson: '{"income":"10"}', showBalance: false },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    const rows = await handle.client.all<{
      user_id: string;
      monthly_plan_json: string;
      show_balance: number;
    }>("SELECT user_id, monthly_plan_json, show_balance FROM finyk_prefs");
    expect(rows).toEqual([
      {
        user_id: USER_ID,
        monthly_plan_json: '{"income":"10"}',
        show_balance: 0,
      },
    ]);
  });

  it("LWW: stale clientTs does NOT overwrite a newer row", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_assets",
          entry: {
            id: "22222222-2222-2222-2222-222222222222",
            dataJson: '{"amount":500}',
          },
        },
      ],
      { userId: USER_ID, clientTs: LATER },
    );
    // Stale write
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_assets",
          entry: {
            id: "22222222-2222-2222-2222-222222222222",
            dataJson: '{"amount":1}',
          },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    const rows = await handle.client.all<{ data_json: string }>(
      "SELECT data_json FROM finyk_assets WHERE id = ?",
      ["22222222-2222-2222-2222-222222222222"],
    );
    expect(JSON.parse(rows[0]!.data_json)).toEqual({ amount: 500 });
  });
});

describe("Finyk dual-write — orchestrator (registerFinykDualWriteContext)", () => {
  it("dualWriteFinykState applies ops when context is registered + flag on", async () => {
    registerFinykDualWriteContext(makeCtx());
    expect(isFinykDualWriteRegistered()).toBe(true);

    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-1" }],
    };
    const out = await dualWriteFinykState(EMPTY_FINYK_STATE, next);
    expect(out.status).toBe("applied");

    const rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM finyk_hidden_accounts",
    );
    expect(rows).toHaveLength(1);
  });

  it("dualWriteFinykState skips when flag is off", async () => {
    registerFinykDualWriteContext(makeCtx({ isEnabled: () => false }));
    const out = await dualWriteFinykState(EMPTY_FINYK_STATE, {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-1" }],
    });
    expect(out).toEqual({ status: "skipped", reason: "flag-off" });
  });

  it("dualWriteFinykState skips when no ops are diffed", async () => {
    registerFinykDualWriteContext(makeCtx());
    const out = await dualWriteFinykState(EMPTY_FINYK_STATE, EMPTY_FINYK_STATE);
    expect(out).toEqual({ status: "skipped", reason: "no-ops" });
  });

  it("dualWriteFinykState skips when user id is missing", async () => {
    registerFinykDualWriteContext(makeCtx({ getUserId: () => null }));
    const out = await dualWriteFinykState(EMPTY_FINYK_STATE, {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-1" }],
    });
    expect(out).toEqual({ status: "skipped", reason: "user-id-missing" });
  });

  it("triggerFinykDualWrite is fire-and-forget (resolves immediately)", async () => {
    registerFinykDualWriteContext(makeCtx());
    triggerFinykDualWrite(EMPTY_FINYK_STATE, {
      ...EMPTY_FINYK_STATE,
      budgets: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          dataJson: '{"amount":42}',
        },
      ],
    });
    // synchronous — row not yet present
    let rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM finyk_budgets WHERE id = ?",
      ["33333333-3333-3333-3333-333333333333"],
    );
    expect(rows).toHaveLength(0);

    // microtask flushed
    await Promise.resolve();
    await Promise.resolve();

    rows = await handle.client.all<Record<string, unknown>>(
      "SELECT * FROM finyk_budgets WHERE id = ?",
      ["33333333-3333-3333-3333-333333333333"],
    );
    expect(rows).toHaveLength(1);
  });

  it("triggerFinykDualWrite no-ops with no context registered", () => {
    expect(() =>
      triggerFinykDualWrite(EMPTY_FINYK_STATE, EMPTY_FINYK_STATE),
    ).not.toThrow();
  });
});
