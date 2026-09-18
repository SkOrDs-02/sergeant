import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Patch enqueueOutboxUpsert so integration tests can assert the outbox
// enqueue shape without a real sync_op_outbox table in the test DB.
// The mock is hoisted via vi.mock so it intercepts the adapter import.
vi.mock("../../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: vi.fn().mockResolvedValue({ id: 1, inserted: true }),
}));
import { enqueueOutboxUpsert } from "../../../../../core/syncEngine/enqueueOutboxUpsert.js";

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

    // queued run flushed (single-flight queue defers via a macrotask —
    // DCRUD-007; wait one real timer turn instead of bare microtasks)
    await new Promise((resolve) => setTimeout(resolve, 10));

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

  // Regression — deep-module-crud.spec.ts:105 ("finyk: creates, edits,
  // deletes, and restores a manual expense"). A create immediately
  // followed by an edit to the SAME row queues two flushes through the
  // DCRUD-007 single-flight queue in `triggerFinykDualWrite`. Each flush
  // computes its own `clientTs` from `ctx.getNow()` — `Date.now()`
  // resolution. `makeCtx()` pins `getNow` to a single constant, which is
  // the deterministic stand-in for two flushes landing in the identical
  // millisecond (plausible in real usage, near-certain on CI's coarser
  // system-timer resolution). Without a strictly-monotonic clientTs, the
  // adapter's LWW guard (`WHERE excluded.updated_at > table.updated_at`,
  // adapter.ts) silently drops the edit — the row keeps the CREATE-time
  // `data_json` forever, exactly matching the reported symptom (edit
  // visible in React state, never in the SQLite row the post-reload
  // overlay reads from).
  it("create-then-edit of the same manual expense with an identical clientTs still applies the edit (DCRUD-108)", async () => {
    registerFinykDualWriteContext(makeCtx());

    // Deterministic drain for the fire-and-forget single-flight queue:
    // poll the actual SQLite row instead of sleeping a fixed interval
    // (a fixed sleep is itself timing-sensitive on slow CI — the very
    // failure class this regression guards against).
    const readExpenseRows = () =>
      handle.client.all<{ data_json: string }>(
        "SELECT data_json FROM finyk_manual_expenses WHERE id = ?",
        ["m-dcrud-108"],
      );

    const created: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      manualExpenses: [
        {
          id: "m-dcrud-108",
          dataJson: JSON.stringify({
            id: "m-dcrud-108",
            description: "DCRUD кава",
            amount: 123,
          }),
        },
      ],
    };
    triggerFinykDualWrite(EMPTY_FINYK_STATE, created);
    // Wait for the create flush to fully apply before enqueueing the
    // edit — two SEPARATE flushes, mirroring the E2E timeline.
    await vi.waitFor(async () => {
      expect(await readExpenseRows()).toHaveLength(1);
    });

    const edited: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      manualExpenses: [
        {
          id: "m-dcrud-108",
          dataJson: JSON.stringify({
            id: "m-dcrud-108",
            description: "DCRUD кава оновлено",
            amount: 123,
          }),
        },
      ],
    };
    // Same registered ctx → same `getNow()` constant as the create above,
    // simulating two flushes that land in the identical millisecond.
    triggerFinykDualWrite(created, edited);
    // Pre-fix code NEVER converges here (the LWW guard drops the edit
    // outright, it does not merely delay it), so waitFor times out and
    // fails the test rather than masking the bug.
    await vi.waitFor(async () => {
      const rows = await readExpenseRows();
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.data_json).description).toBe(
        "DCRUD кава оновлено",
      );
    });
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

// -----------------------------------------------------------------------
// Outbox enqueue wiring
// -----------------------------------------------------------------------

describe("Finyk dual-write — outbox enqueue wiring", () => {
  const enqueueMock = enqueueOutboxUpsert as ReturnType<typeof vi.fn>;

  let handle: TestSqliteHandle;

  beforeEach(async () => {
    handle = await createTestSqlite();
    enqueueMock.mockClear();
    enqueueMock.mockResolvedValue({ id: 1, inserted: true });
  });

  afterEach(() => {
    __clearFinykDualWriteContextForTests();
    handle.close();
  });

  function makeCtx(): FinykDualWriteContext {
    return {
      getUserId: () => USER_ID,
      getMigrationClient: async () => handle.client,
      getNow: () => NOW,
    };
  }

  it("enqueues finyk_hidden_accounts insert on id-upsert", async () => {
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
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_hidden_accounts");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({ user_id: USER_ID, account_id: "acc-1" });
  });

  it("enqueues finyk_hidden_accounts delete on id-delete", async () => {
    // Seed a row first
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts",
          entry: { id: "acc-2" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    enqueueMock.mockClear();
    await applyFinykDualWriteOps(
      handle.client,
      [{ kind: "id-delete", table: "finyk_hidden_accounts", id: "acc-2" }],
      { userId: USER_ID, clientTs: LATER },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_hidden_accounts");
    expect(input.op).toBe("delete");
    expect(input.row).toMatchObject({ user_id: USER_ID, account_id: "acc-2" });
  });

  it("enqueues finyk_hidden_transactions insert on id-upsert", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_transactions",
          entry: { id: "tx-1" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_hidden_transactions");
    expect(input.row).toMatchObject({
      user_id: USER_ID,
      transaction_id: "tx-1",
    });
  });

  it("enqueues blob-table insert (finyk_budgets) on blob-upsert", async () => {
    const id = "44444444-4444-4444-4444-444444444444";
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_budgets",
          entry: { id, dataJson: '{"amount":500}' },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_budgets");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      id,
      user_id: USER_ID,
      data_json: '{"amount":500}',
    });
  });

  it("enqueues blob-table delete (finyk_manual_expenses) on blob-delete", async () => {
    const id = "55555555-5555-5555-5555-555555555555";
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_manual_expenses",
          entry: { id, dataJson: "{}" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    enqueueMock.mockClear();
    await applyFinykDualWriteOps(
      handle.client,
      [{ kind: "blob-delete", table: "finyk_manual_expenses", id }],
      { userId: USER_ID, clientTs: LATER },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_manual_expenses");
    expect(input.op).toBe("delete");
    expect(input.row).toMatchObject({ id, user_id: USER_ID });
  });

  it("enqueues finyk_tx_categories insert on tx-category-upsert", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "tx-category-upsert",
          entry: { transactionId: "tx-cat-1", categoryId: "food" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_tx_categories");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      user_id: USER_ID,
      transaction_id: "tx-cat-1",
      category_id: "food",
    });
  });

  it("enqueues finyk_tx_splits insert on tx-splits-upsert", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "tx-splits-upsert",
          entry: { transactionId: "tx-sp-1", splitsJson: "[]" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_tx_splits");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      user_id: USER_ID,
      transaction_id: "tx-sp-1",
      splits_json: "[]",
    });
  });

  it("does NOT enqueue finyk_mono_debt_links (R7 local-only)", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "mono-debt-link-upsert",
          entry: { transactionId: "tx-mdl-1", debtIdsJson: '["d1"]' },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it("enqueues finyk_networth_history insert on networth-upsert", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "networth-upsert",
          entry: { month: "2026-01", networth: 12000 },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_networth_history");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({
      user_id: USER_ID,
      month: "2026-01",
      networth: 12000,
    });
  });

  it("enqueues finyk_prefs insert on prefs-upsert", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "prefs-upsert",
          prefs: {
            monthlyPlanJson: "{}",
            showBalance: true,
            excludedStatTxIdsJson: "[]",
            dismissedRecurringJson: "[]",
          },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_prefs");
    expect(input.op).toBe("insert");
    expect(input.row).toMatchObject({ user_id: USER_ID, show_balance: 1 });
  });

  it("does NOT reject dualWrite when enqueueOutboxUpsert throws (fire-and-forget)", async () => {
    enqueueMock.mockRejectedValue(new Error("disk full"));
    const result = await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_assets",
          entry: { id: "a-1", dataJson: "{}" },
        },
      ],
      { userId: USER_ID, clientTs: NOW },
    );
    expect(result.applied).toBe(1);
    expect(result.errored).toBe(0);
  });

  it("dualWriteFinykState enqueues on mutation via full orchestrator", async () => {
    registerFinykDualWriteContext(makeCtx());
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-orch-1" }],
    };
    await dualWriteFinykState(EMPTY_FINYK_STATE, next);
    await Promise.resolve();
    await Promise.resolve();
    expect(enqueueMock).toHaveBeenCalledOnce();
    const [, input] = enqueueMock.mock.calls[0]!;
    expect(input.table).toBe("finyk_hidden_accounts");
    expect(input.row).toMatchObject({ account_id: "acc-orch-1" });
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey.length).toBeGreaterThan(0);
  });
});
