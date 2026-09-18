// Pure-функції з `diff.ts`: `diffFinykDualWriteOps` (public entrypoint),
// `EMPTY_FINYK_STATE` (canonical empty state), а також їхні внутрішні
// помічники `diffById` / `diffBlobs` / `diffByKey` / `prefsChanged`,
// які доступні лише через публічний API.
//
// Покриваємо:
//   - identity / empty cases (prev === next; обидва порожні);
//   - id-tables (`finyk_hidden_accounts`, `finyk_hidden_transactions`):
//     upsert, delete, no-op для повторного посилання, стабільне
//     сортування за `id`;
//   - blob-tables (всі 7 — budgets / subs / assets / debts / receivables
//     / custom_categories / manual_expenses): upsert, delete, no-op
//     коли `dataJson` ідентичний, no-op коли посилання збігається,
//     стабільне сортування;
//   - per-tx mappings (`txCategories`, `txSplits`, `monoDebtLinks`):
//     upsert (новий ключ і change-detection через hasChanged-колбек),
//     delete, no-op для повторного посилання, стабільне сортування за
//     `transactionId`;
//   - time-series `networthHistory`: upsert (новий або змінений
//     networth), no-op коли значення збігається, відсутність delete-op;
//   - singleton `prefs`: usual transitions (null/value переходи, кожне з
//     чотирьох полів, no-op для повторного посилання та byte-identical
//     знімків);
//   - детермінований порядок операцій між класами сутностей.

import { describe, expect, it } from "vitest";

import {
  diffFinykDualWriteOps,
  EMPTY_FINYK_STATE,
  type FinykBlobEntry,
  type FinykBlobTable,
  type FinykDualWriteOp,
  type FinykDualWriteState,
  type FinykPrefsSnapshot,
} from "./diff.js";

function blob(
  id: string,
  payload: Record<string, unknown> = {},
): FinykBlobEntry {
  return { id, dataJson: JSON.stringify({ id, ...payload }) };
}

function makePrefs(
  overrides: Partial<FinykPrefsSnapshot> = {},
): FinykPrefsSnapshot {
  return {
    monthlyPlanJson: "{}",
    showBalance: true,
    excludedStatTxIdsJson: "[]",
    dismissedRecurringJson: "[]",
    ...overrides,
  };
}

describe("diffFinykDualWriteOps — identity / empty", () => {
  it("повертає [] коли prev === next (same reference)", () => {
    expect(diffFinykDualWriteOps(EMPTY_FINYK_STATE, EMPTY_FINYK_STATE)).toEqual(
      [],
    );
  });

  it("повертає [] коли обидва стани канонічно порожні (різні посилання)", () => {
    const prev: FinykDualWriteState = { ...EMPTY_FINYK_STATE };
    const next: FinykDualWriteState = { ...EMPTY_FINYK_STATE };
    expect(prev).not.toBe(next);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("EMPTY_FINYK_STATE має всі колекції порожніми та prefs=null", () => {
    expect(EMPTY_FINYK_STATE.hiddenAccounts).toEqual([]);
    expect(EMPTY_FINYK_STATE.hiddenTransactions).toEqual([]);
    expect(EMPTY_FINYK_STATE.budgets).toEqual([]);
    expect(EMPTY_FINYK_STATE.subscriptions).toEqual([]);
    expect(EMPTY_FINYK_STATE.assets).toEqual([]);
    expect(EMPTY_FINYK_STATE.debts).toEqual([]);
    expect(EMPTY_FINYK_STATE.receivables).toEqual([]);
    expect(EMPTY_FINYK_STATE.customCategories).toEqual([]);
    expect(EMPTY_FINYK_STATE.manualExpenses).toEqual([]);
    expect(EMPTY_FINYK_STATE.txCategories).toEqual([]);
    expect(EMPTY_FINYK_STATE.txSplits).toEqual([]);
    expect(EMPTY_FINYK_STATE.monoDebtLinks).toEqual([]);
    expect(EMPTY_FINYK_STATE.networthHistory).toEqual([]);
    expect(EMPTY_FINYK_STATE.prefs).toBeNull();
  });
});

describe("diffFinykDualWriteOps — id-tables", () => {
  it("emit-ить id-upsert для всіх нових записів у hiddenAccounts, у порядку id ASC", () => {
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      // навмисно подаємо неупорядковані id, щоб перевірити сортування
      hiddenAccounts: [{ id: "acc-2" }, { id: "acc-1" }],
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

  it("emit-ить id-delete для видалених hiddenAccounts (сортування id ASC)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "z" }, { id: "a" }, { id: "m" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "m" }],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      { kind: "id-delete", table: "finyk_hidden_accounts", id: "a" },
      { kind: "id-delete", table: "finyk_hidden_accounts", id: "z" },
    ]);
  });

  it("не emit-ить id-upsert коли той самий id повторюється з іншим обʼєктом (set membership only)", () => {
    // hasChanged для id-tables повертає false — навіть якщо посилання
    // різні, але id збігається, ніяких операцій не має бути.
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-1" }],
      hiddenTransactions: [{ id: "tx-1" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "acc-1" }],
      hiddenTransactions: [{ id: "tx-1" }],
    };
    expect(prev.hiddenAccounts[0]).not.toBe(next.hiddenAccounts[0]);
    expect(prev.hiddenTransactions[0]).not.toBe(next.hiddenTransactions[0]);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("emit-ить id-upsert для нових hiddenTransactions у порядку id ASC", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenTransactions: [{ id: "tx-a" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenTransactions: [{ id: "tx-c" }, { id: "tx-a" }, { id: "tx-b" }],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "id-upsert",
        table: "finyk_hidden_transactions",
        entry: { id: "tx-b" },
      },
      {
        kind: "id-upsert",
        table: "finyk_hidden_transactions",
        entry: { id: "tx-c" },
      },
    ]);
  });

  it("emit-ить id-delete для видалених hiddenTransactions", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenTransactions: [{ id: "tx-a" }, { id: "tx-b" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenTransactions: [{ id: "tx-a" }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      { kind: "id-delete", table: "finyk_hidden_transactions", id: "tx-b" },
    ]);
  });

  it("комбінує id-upsert і id-delete у одному виклику (upsert першими, delete останніми)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "old" }, { id: "kept" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      hiddenAccounts: [{ id: "kept" }, { id: "new" }],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "id-upsert",
        table: "finyk_hidden_accounts",
        entry: { id: "new" },
      },
      { kind: "id-delete", table: "finyk_hidden_accounts", id: "old" },
    ]);
  });
});

describe("diffFinykDualWriteOps — blob-tables", () => {
  const blobTables: ReadonlyArray<{
    key: keyof Pick<
      FinykDualWriteState,
      | "budgets"
      | "subscriptions"
      | "assets"
      | "debts"
      | "receivables"
      | "customCategories"
      | "manualExpenses"
    >;
    table: FinykBlobTable;
  }> = [
    { key: "budgets", table: "finyk_budgets" },
    { key: "subscriptions", table: "finyk_subscriptions" },
    { key: "assets", table: "finyk_assets" },
    { key: "debts", table: "finyk_debts" },
    { key: "receivables", table: "finyk_receivables" },
    { key: "customCategories", table: "finyk_custom_categories" },
    { key: "manualExpenses", table: "finyk_manual_expenses" },
  ];

  it.each(blobTables)(
    "emit-ить blob-upsert для нових записів у `$key` ($table)",
    ({ key, table }) => {
      const next: FinykDualWriteState = {
        ...EMPTY_FINYK_STATE,
        [key]: [blob("b-2", { v: 2 }), blob("b-1", { v: 1 })],
      };
      const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
      expect(ops).toEqual([
        { kind: "blob-upsert", table, entry: blob("b-1", { v: 1 }) },
        { kind: "blob-upsert", table, entry: blob("b-2", { v: 2 }) },
      ]);
    },
  );

  it.each(blobTables)(
    "emit-ить blob-delete для видалених записів у `$key` ($table)",
    ({ key, table }) => {
      const prev: FinykDualWriteState = {
        ...EMPTY_FINYK_STATE,
        [key]: [blob("b-1"), blob("b-2")],
      };
      const next: FinykDualWriteState = {
        ...EMPTY_FINYK_STATE,
        [key]: [blob("b-1")],
      };
      expect(diffFinykDualWriteOps(prev, next)).toEqual([
        { kind: "blob-delete", table, id: "b-2" },
      ]);
    },
  );

  it("emit-ить blob-upsert коли dataJson змінився", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("b1", { amount: 100 })],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("b1", { amount: 200 })],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "blob-upsert",
        table: "finyk_budgets",
        entry: blob("b1", { amount: 200 }),
      },
    ]);
  });

  it("не emit-ить нічого коли dataJson не змінився (різні посилання, ідентичний серіалізований blob)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      subscriptions: [blob("s1", { name: "Spotify" })],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      subscriptions: [blob("s1", { name: "Spotify" })],
    };
    expect(prev.subscriptions[0]).not.toBe(next.subscriptions[0]);
    expect(prev.subscriptions[0]?.dataJson).toBe(
      next.subscriptions[0]?.dataJson,
    );
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("не emit-ить нічого коли посилання на blob-запис збігається (same reference fast-path)", () => {
    const sharedBlob = blob("b1", { amount: 42 });
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [sharedBlob],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [sharedBlob],
    };
    expect(prev.budgets[0]).toBe(next.budgets[0]);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("комбінує upsert (нові) і delete (видалені) у межах одної blob-таблиці, сортуючи за id ASC", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      assets: [blob("a-old"), blob("a-keep", { v: 1 })],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      assets: [
        blob("a-new-2"),
        blob("a-keep", { v: 2 }), // dataJson змінено
        blob("a-new-1"),
      ],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "blob-upsert",
        table: "finyk_assets",
        entry: blob("a-keep", { v: 2 }),
      },
      {
        kind: "blob-upsert",
        table: "finyk_assets",
        entry: blob("a-new-1"),
      },
      {
        kind: "blob-upsert",
        table: "finyk_assets",
        entry: blob("a-new-2"),
      },
      { kind: "blob-delete", table: "finyk_assets", id: "a-old" },
    ]);
  });
});

describe("diffFinykDualWriteOps — per-tx mappings", () => {
  // --- txCategories ---
  it("txCategories: emit upsert для нових і delete для видалених, сортовано за transactionId ASC", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [
        { transactionId: "tx-2", categoryId: "cat-old" },
        { transactionId: "tx-1", categoryId: "cat-keep" },
      ],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [
        { transactionId: "tx-1", categoryId: "cat-keep" }, // unchanged → no op
        { transactionId: "tx-3", categoryId: "cat-new" }, // upsert
      ],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "tx-3", categoryId: "cat-new" },
      },
      { kind: "tx-category-delete", transactionId: "tx-2" },
    ]);
  });

  it("txCategories: emit upsert коли categoryId змінився для існуючого transactionId", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [{ transactionId: "tx-1", categoryId: "cat-old" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [{ transactionId: "tx-1", categoryId: "cat-new" }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      {
        kind: "tx-category-upsert",
        entry: { transactionId: "tx-1", categoryId: "cat-new" },
      },
    ]);
  });

  it("txCategories: not-changed (різне посилання, той самий categoryId) — без операцій", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [{ transactionId: "tx-1", categoryId: "cat-x" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txCategories: [{ transactionId: "tx-1", categoryId: "cat-x" }],
    };
    expect(prev.txCategories[0]).not.toBe(next.txCategories[0]);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  // --- txSplits ---
  it("txSplits: emit upsert коли splitsJson змінився для того ж transactionId", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-1", splitsJson: "[]" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-1", splitsJson: '[{"amount":1}]' }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      {
        kind: "tx-splits-upsert",
        entry: { transactionId: "tx-1", splitsJson: '[{"amount":1}]' },
      },
    ]);
  });

  it("txSplits: emit upsert (новий) + delete (видалений)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-1", splitsJson: "[{}]" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-2", splitsJson: "[{}]" }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      {
        kind: "tx-splits-upsert",
        entry: { transactionId: "tx-2", splitsJson: "[{}]" },
      },
      { kind: "tx-splits-delete", transactionId: "tx-1" },
    ]);
  });

  it("txSplits: not-changed (різне посилання, той самий splitsJson) — без операцій", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-1", splitsJson: "[]" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      txSplits: [{ transactionId: "tx-1", splitsJson: "[]" }],
    };
    expect(prev.txSplits[0]).not.toBe(next.txSplits[0]);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  // --- monoDebtLinks ---
  it("monoDebtLinks: emit upsert для нових записів, сортовано за transactionId ASC", () => {
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [
        { transactionId: "tx-b", debtIdsJson: '["d1"]' },
        { transactionId: "tx-a", debtIdsJson: '["d2"]' },
      ],
    };
    const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
    expect(ops).toEqual([
      {
        kind: "mono-debt-link-upsert",
        entry: { transactionId: "tx-a", debtIdsJson: '["d2"]' },
      },
      {
        kind: "mono-debt-link-upsert",
        entry: { transactionId: "tx-b", debtIdsJson: '["d1"]' },
      },
    ]);
  });

  it("monoDebtLinks: emit upsert коли debtIdsJson змінився", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [{ transactionId: "tx-1", debtIdsJson: '["d1"]' }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [{ transactionId: "tx-1", debtIdsJson: '["d1","d2"]' }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      {
        kind: "mono-debt-link-upsert",
        entry: { transactionId: "tx-1", debtIdsJson: '["d1","d2"]' },
      },
    ]);
  });

  it("monoDebtLinks: emit delete для видалених записів", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [
        { transactionId: "tx-1", debtIdsJson: '["d1"]' },
        { transactionId: "tx-2", debtIdsJson: '["d2"]' },
      ],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [{ transactionId: "tx-1", debtIdsJson: '["d1"]' }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      { kind: "mono-debt-link-delete", transactionId: "tx-2" },
    ]);
  });

  it("monoDebtLinks: not-changed (різне посилання, той самий debtIdsJson) — без операцій", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [{ transactionId: "tx-1", debtIdsJson: "[]" }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      monoDebtLinks: [{ transactionId: "tx-1", debtIdsJson: "[]" }],
    };
    expect(prev.monoDebtLinks[0]).not.toBe(next.monoDebtLinks[0]);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });
});

describe("diffFinykDualWriteOps — networthHistory (time-series)", () => {
  it("emit networth-upsert для нових місяців у порядку month ASC", () => {
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [
        { month: "2026-05", networth: 200 },
        { month: "2026-03", networth: 50 },
        { month: "2026-04", networth: 100 },
      ],
    };
    const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
    expect(ops).toEqual([
      {
        kind: "networth-upsert",
        entry: { month: "2026-03", networth: 50 },
      },
      {
        kind: "networth-upsert",
        entry: { month: "2026-04", networth: 100 },
      },
      {
        kind: "networth-upsert",
        entry: { month: "2026-05", networth: 200 },
      },
    ]);
  });

  it("emit networth-upsert коли networth для існуючого місяця змінився", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [{ month: "2026-04", networth: 100 }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [{ month: "2026-04", networth: 250 }],
    };
    expect(diffFinykDualWriteOps(prev, next)).toEqual([
      {
        kind: "networth-upsert",
        entry: { month: "2026-04", networth: 250 },
      },
    ]);
  });

  it("не emit-ить нічого коли networth не змінився (той самий month + networth)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [{ month: "2026-04", networth: 100 }],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [{ month: "2026-04", networth: 100 }],
    };
    expect(prev.networthHistory[0]).not.toBe(next.networthHistory[0]);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("не emit-ить delete для видаленого місяця — time-series append-only", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [
        { month: "2026-03", networth: 50 },
        { month: "2026-04", networth: 100 },
      ],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      networthHistory: [{ month: "2026-04", networth: 200 }],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "networth-upsert",
        entry: { month: "2026-04", networth: 200 },
      },
    ]);
    expect(
      ops.some(
        (o) => o.kind === ("networth-delete" as FinykDualWriteOp["kind"]),
      ),
    ).toBe(false);
  });
});

describe("diffFinykDualWriteOps — prefs singleton", () => {
  it("prev=null, next=null → []", () => {
    expect(diffFinykDualWriteOps(EMPTY_FINYK_STATE, EMPTY_FINYK_STATE)).toEqual(
      [],
    );
  });

  it("prev=null, next=value → emit prefs-upsert", () => {
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: makePrefs({ showBalance: false }),
    };
    expect(diffFinykDualWriteOps(EMPTY_FINYK_STATE, next)).toEqual([
      {
        kind: "prefs-upsert",
        prefs: makePrefs({ showBalance: false }),
      },
    ]);
  });

  it("prev=value, next=null → нічого не emit-ить (нема delete-op для prefs)", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: makePrefs(),
    };
    expect(diffFinykDualWriteOps(prev, EMPTY_FINYK_STATE)).toEqual([]);
  });

  it("prev !== next ref але обидва містять однакові поля → []", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: makePrefs(),
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: makePrefs(),
    };
    expect(prev.prefs).not.toBe(next.prefs);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it("той самий prefs (same reference) → нічого не emit-ить", () => {
    const prefs = makePrefs();
    const prev: FinykDualWriteState = { ...EMPTY_FINYK_STATE, prefs };
    const next: FinykDualWriteState = { ...EMPTY_FINYK_STATE, prefs };
    expect(prev.prefs).toBe(next.prefs);
    expect(diffFinykDualWriteOps(prev, next)).toEqual([]);
  });

  it.each([
    {
      field: "monthlyPlanJson" as const,
      prevVal: '{"income":1}',
      nextVal: '{"income":2}',
    },
    {
      field: "showBalance" as const,
      prevVal: true,
      nextVal: false,
    },
    {
      field: "excludedStatTxIdsJson" as const,
      prevVal: "[]",
      nextVal: '["tx-1","tx-2"]',
    },
    {
      field: "dismissedRecurringJson" as const,
      prevVal: "[]",
      nextVal: '["banner-a"]',
    },
  ])(
    "emit prefs-upsert коли поле `$field` змінилося",
    ({ field, prevVal, nextVal }) => {
      const prev: FinykDualWriteState = {
        ...EMPTY_FINYK_STATE,
        prefs: makePrefs({ [field]: prevVal } as Partial<FinykPrefsSnapshot>),
      };
      const next: FinykDualWriteState = {
        ...EMPTY_FINYK_STATE,
        prefs: makePrefs({ [field]: nextVal } as Partial<FinykPrefsSnapshot>),
      };
      const ops = diffFinykDualWriteOps(prev, next);
      expect(ops).toHaveLength(1);
      expect(ops[0]).toEqual({
        kind: "prefs-upsert",
        prefs: makePrefs({ [field]: nextVal } as Partial<FinykPrefsSnapshot>),
      });
    },
  );
});

describe("diffFinykDualWriteOps — детермінований порядок між класами", () => {
  it("emit-ить ops у канонічному порядку: id-tables → blob-tables → per-tx → networth → prefs", () => {
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
      prefs: makePrefs(),
    };
    const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
    expect(ops.map((o) => o.kind)).toEqual([
      "id-upsert", // hiddenAccounts
      "id-upsert", // hiddenTransactions
      "blob-upsert", // budgets
      "blob-upsert", // subscriptions
      "blob-upsert", // assets
      "blob-upsert", // debts
      "blob-upsert", // receivables
      "blob-upsert", // customCategories
      "blob-upsert", // manualExpenses
      "tx-category-upsert",
      "tx-splits-upsert",
      "mono-debt-link-upsert",
      "networth-upsert",
      "prefs-upsert",
    ]);
  });

  it("blob-таблиці emit-яться в порядку: budgets → subscriptions → assets → debts → receivables → customCategories → manualExpenses", () => {
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("any")],
      subscriptions: [blob("any")],
      assets: [blob("any")],
      debts: [blob("any")],
      receivables: [blob("any")],
      customCategories: [blob("any")],
      manualExpenses: [blob("any")],
    };
    const ops = diffFinykDualWriteOps(EMPTY_FINYK_STATE, next);
    const tables = ops
      .filter(
        (o): o is FinykDualWriteOp & { kind: "blob-upsert" } =>
          o.kind === "blob-upsert",
      )
      .map((o) => o.table);
    expect(tables).toEqual([
      "finyk_budgets",
      "finyk_subscriptions",
      "finyk_assets",
      "finyk_debts",
      "finyk_receivables",
      "finyk_custom_categories",
      "finyk_manual_expenses",
    ]);
  });

  it("в межах однієї blob-таблиці upsert-и emit-яться у порядку id ASC, далі delete-и у порядку id ASC", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("z-old"), blob("a-old")],
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      budgets: [blob("m-new"), blob("b-new")],
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      { kind: "blob-upsert", table: "finyk_budgets", entry: blob("b-new") },
      { kind: "blob-upsert", table: "finyk_budgets", entry: blob("m-new") },
      { kind: "blob-delete", table: "finyk_budgets", id: "a-old" },
      { kind: "blob-delete", table: "finyk_budgets", id: "z-old" },
    ]);
  });

  it("emit-ить тільки prefs-upsert коли решта стейту незмінна", () => {
    const prev: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: makePrefs({ showBalance: true }),
    };
    const next: FinykDualWriteState = {
      ...EMPTY_FINYK_STATE,
      prefs: makePrefs({ showBalance: false }),
    };
    const ops = diffFinykDualWriteOps(prev, next);
    expect(ops).toEqual([
      {
        kind: "prefs-upsert",
        prefs: makePrefs({ showBalance: false }),
      },
    ]);
  });
});
