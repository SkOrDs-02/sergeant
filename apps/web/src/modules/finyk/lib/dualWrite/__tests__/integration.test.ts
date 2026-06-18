import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __clearFinykDualWriteContextForTests,
  applyFinykDualWriteOps,
  applyFinykDualWriteOpsViaContext,
  dualWriteFinykState,
  isFinykDualWriteRegistered,
  registerFinykDualWriteContext,
  triggerFinykDualWrite,
  triggerHiddenTransactionSqliteMirror,
  triggerManualExpenseSqliteMirror,
  triggerTxCategorySqliteMirror,
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
          prefs: {
            monthlyPlanJson: '{"income":"10"}',
            showBalance: false,
            excludedStatTxIdsJson: '["tx-1","tx-2"]',
            dismissedRecurringJson: '["banner-a"]',
          },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    const rows = await handle.client.all<{
      user_id: string;
      monthly_plan_json: string;
      show_balance: number;
      excluded_stat_tx_ids_json: string;
      dismissed_recurring_json: string;
    }>(
      `SELECT user_id, monthly_plan_json, show_balance,
              excluded_stat_tx_ids_json, dismissed_recurring_json
         FROM finyk_prefs`,
    );
    expect(rows).toEqual([
      {
        user_id: USER_ID,
        monthly_plan_json: '{"income":"10"}',
        show_balance: 0,
        excluded_stat_tx_ids_json: '["tx-1","tx-2"]',
        dismissed_recurring_json: '["banner-a"]',
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
  it("dualWriteFinykState applies ops when context is registered", async () => {
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

describe("Finyk dual-write — applyFinykDualWriteOpsViaContext + mirrors", () => {
  // The mirror helpers are fire-and-forget; drain microtasks + one
  // macrotask so the async apply chain settles before we read SQLite.
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("skips when no context is registered", async () => {
    const outcome = await applyFinykDualWriteOpsViaContext([
      {
        kind: "id-upsert",
        table: "finyk_hidden_transactions",
        entry: { id: "t-1" },
      },
    ]);
    expect(outcome).toEqual({ status: "skipped", reason: "context-unset" });
  });

  it("applies a pre-built op list through the context (no diff, no parity probe)", async () => {
    registerFinykDualWriteContext(makeCtx());
    const outcome = await applyFinykDualWriteOpsViaContext([
      {
        kind: "blob-upsert",
        table: "finyk_manual_expenses",
        entry: {
          id: "ai-uuid-1",
          dataJson: JSON.stringify({
            id: "ai-uuid-1",
            amount: 320,
            type: "expense",
          }),
        },
      },
    ]);
    expect(outcome.status).toBe("applied");
    const rows = await handle.client.all<{ id: string; data_json: string }>(
      "SELECT id, data_json FROM finyk_manual_expenses WHERE id = ?",
      ["ai-uuid-1"],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.data_json).amount).toBe(320);
  });

  it("triggerManualExpenseSqliteMirror upserts a manual-expense blob (грн)", async () => {
    registerFinykDualWriteContext(makeCtx());
    triggerManualExpenseSqliteMirror({
      id: "m_x",
      date: "2026-05-04",
      description: "кава",
      amount: 120,
      category: "restaurant",
      type: "expense",
    });
    await flush();
    const rows = await handle.client.all<{ data_json: string }>(
      "SELECT data_json FROM finyk_manual_expenses WHERE id = ?",
      ["m_x"],
    );
    expect(rows).toHaveLength(1);
    // Amount mirrored verbatim in грн — no ×100 (server-API-only).
    expect(JSON.parse(rows[0]!.data_json).amount).toBe(120);
  });

  it("triggerHiddenTransactionSqliteMirror upserts a hidden-tx row", async () => {
    registerFinykDualWriteContext(makeCtx());
    triggerHiddenTransactionSqliteMirror("tx-hide-1");
    await flush();
    const rows = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_hidden_transactions WHERE transaction_id = ?",
      ["tx-hide-1"],
    );
    expect(rows).toHaveLength(1);
  });

  it("triggerTxCategorySqliteMirror upserts per-tx category overrides", async () => {
    registerFinykDualWriteContext(makeCtx());
    triggerTxCategorySqliteMirror([
      { transactionId: "tx-1", categoryId: "food" },
      { transactionId: "tx-2", categoryId: "transport" },
    ]);
    await flush();
    const rows = await handle.client.all<{
      transaction_id: string;
      category_id: string;
    }>(
      "SELECT transaction_id, category_id FROM finyk_tx_categories ORDER BY transaction_id",
    );
    expect(rows).toEqual([
      { transaction_id: "tx-1", category_id: "food" },
      { transaction_id: "tx-2", category_id: "transport" },
    ]);
  });

  it("triggerManualExpenseSqliteMirror no-ops with no context registered", async () => {
    expect(() =>
      triggerManualExpenseSqliteMirror({ id: "m_none", amount: 10 }),
    ).not.toThrow();
    await flush();
    const rows = await handle.client.all(
      "SELECT id FROM finyk_manual_expenses WHERE id = ?",
      ["m_none"],
    );
    expect(rows).toHaveLength(0);
  });
});
