import { describe, expect, it } from "vitest";

import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykDualWriteState,
} from "../diff.js";

function blob(id: string, payload: Record<string, unknown> = {}) {
  return { id, dataJson: JSON.stringify({ id, ...payload }) };
}

describe("diffFinykDualWriteOps", () => {
  it("returns no ops when prev === next (identity case)", () => {
    expect(diffFinykDualWriteOps(EMPTY_FINYK_STATE, EMPTY_FINYK_STATE)).toEqual(
      [],
    );
  });

  it("emits id-upsert ops for new hidden accounts", () => {
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-1" }, { id: "acc-2" }],
    };
    const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
    expect(ops).toEqual([
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "acc-1" },
      },
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "acc-2" },
      },
    ]);
  });

  it("emits id-delete ops for removed hidden transactions", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenTransactions: [{ id: "tx-a" }, { id: "tx-b" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenTransactions: [{ id: "tx-a" }],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "id-delete",
        table: "finyk_hidden_transactions",
        id: "tx-b",
      },
    ]);
  });

  it("emits blob-upsert when budget data changes (json string differs)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("b1", { amount: 100 })],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("b1", { amount: 200 })],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      kind: "blob-upsert",
      table: "finyk_budgets",
      entry: { id: "b1" },
    });
  });

  it("emits blob-delete when a budget is removed", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("b1"), blob("b2")],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("b1")],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      { kind: "blob-delete", table: "finyk_budgets", id: "b2" },
    ]);
  });

  it("ignores rows whose dataJson is unchanged (deep-equal blobs do not retrigger)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      subscriptions: [blob("s1", { name: "Spotify" })],
    };
    // Same id + same JSON payload -> no op.
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      subscriptions: [blob("s1", { name: "Spotify" })],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("emits tx-category-upsert / tx-category-delete on per-tx mapping diff", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [
        { transactionId: "tx-1", categoryId: "cat-old" },
        { transactionId: "tx-2", categoryId: "cat-other" },
      ],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [
        { transactionId: "tx-1", categoryId: "cat-new" },
        // tx-2 removed
        { transactionId: "tx-3", categoryId: "cat-third" },
      ],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "tx-1", categoryId: "cat-new" },
      },
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "tx-3", categoryId: "cat-third" },
      },
      { kind: "tx-category-delete", transactionId: "tx-2" },
    ]);
  });

  it("emits tx-splits-upsert / tx-splits-delete on per-tx splits diff", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-1", splitsJson: "[{}]" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-2", splitsJson: "[{}]" }],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "tx-splits-upsert",
        entry: { transactionId: "tx-2", splitsJson: "[{}]" },
      },
      { kind: "tx-splits-delete", transactionId: "tx-1" },
    ]);
  });

  it("emits networth-upsert (no delete op for time-series)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [
        { month: "2026-04", networth: 100 },
        { month: "2026-03", networth: 50 },
      ],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [
        { month: "2026-04", networth: 200 }, // changed
        // 2026-03 removed — no delete op should be emitted
      ],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "networth-upsert",
        entry: { month: "2026-04", networth: 200 },
      },
    ]);
  });

  it("emits prefs-upsert when monthlyPlanJson or showBalance change", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: { monthlyPlanJson: '{"income":1}', showBalance: true },
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: { monthlyPlanJson: '{"income":1}', showBalance: false },
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "prefs-upsert",
        prefs: { monthlyPlanJson: '{"income":1}', showBalance: false },
      },
    ]);
  });

  it("does not emit prefs-upsert when prefs are byte-identical", () => {
    const prefs = { monthlyPlanJson: "{}", showBalance: true };
    const prev: FinykDualWriteState = { ...EMPTY_FINYK_STATE, prefs };
    const next: FinykDualWriteState = { ...EMPTY_FINYK_STATE, prefs };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("emits ops in deterministic order (id-tables → blobs → per-tx → networth → prefs)", () => {
    const prev = EMPTY_FINYK_STATE;
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "ha-1" }],
      hiddenTransactions: [{ id: "ht-1" }],
      budgets: [blob("bud")],
      subscriptions: [blob("sub")],
      assets: [blob("ast")],
      debts: [blob("dbt")],
      receivables: [blob("rcv")],
      customCategories: [blob("cat")],
      manualExpenses: [blob("exp")],
      txCategories: [{ transactionId: "tx-1", categoryId: "c1" }],
      txSplits: [{ transactionId: "tx-2", splitsJson: "[]" }],
      monoDebtLinks: [{ transactionId: "tx-3", debtIdsJson: "[]" }],
      networthHistory: [{ month: "2026-04", networth: 1 }],
      prefs: { monthlyPlanJson: "{}", showBalance: true },
    };
    const ops = diffFinykDualWriteOps(prev, next);
    const kinds = ops.map((o) => o.kind);
    expect(kinds).toEqual([
      "id-upsert",
      "id-upsert",
      "blob-upsert",
      "blob-upsert",
      "blob-upsert",
      "blob-upsert",
      "blob-upsert",
      "blob-upsert",
      "blob-upsert",
      "tx-category-upsert",
      "tx-splits-upsert",
      "mono-debt-link-upsert",
      "networth-upsert",
      "prefs-upsert",
    ]);
  });
});
