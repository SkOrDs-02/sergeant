import { describe, expect, it } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

import type {
  FinykBlobEntry,
  FinykDualWriteState,
  FinykIdEntry,
  FinykMonoDebtLinkEntry,
  FinykNetworthEntry,
  FinykPrefsSnapshot,
  FinykTxCategoryEntry,
  FinykTxSplitsEntry,
} from "../diff.js";
import { probeFinykParity } from "../parity.js";
import { createTestSqlite } from "./testSqlite.js";

const USER_ID = "user-1";
const TS = "2026-05-08T10:00:00.000Z";

const EMPTY_STATE: FinykDualWriteState = {
  hiddenAccounts: [],
  hiddenTransactions: [],
  budgets: [],
  subscriptions: [],
  assets: [],
  debts: [],
  receivables: [],
  customCategories: [],
  manualExpenses: [],
  txCategories: [],
  txSplits: [],
  monoDebtLinks: [],
  networthHistory: [],
  prefs: null,
};

// -------------------- seed helpers --------------------

async function seedHiddenAccount(
  client: SqliteMigrationClient,
  accountId: string,
  opts: { deletedAt?: string | null; userId?: string } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_hidden_accounts
       (user_id, account_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
    [opts.userId ?? USER_ID, accountId, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedHiddenTransaction(
  client: SqliteMigrationClient,
  txId: string,
  opts: { deletedAt?: string | null; userId?: string } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_hidden_transactions
       (user_id, transaction_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
    [opts.userId ?? USER_ID, txId, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedBlob(
  client: SqliteMigrationClient,
  table:
    | "finyk_budgets"
    | "finyk_subscriptions"
    | "finyk_assets"
    | "finyk_debts"
    | "finyk_receivables"
    | "finyk_custom_categories"
    | "finyk_manual_expenses",
  id: string,
  opts: { deletedAt?: string | null; userId?: string } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO ${table}
       (id, user_id, data_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, '{}', ?, ?, ?)`,
    [id, opts.userId ?? USER_ID, TS, TS, opts.deletedAt ?? null],
  );
}

async function seedTxCategory(
  client: SqliteMigrationClient,
  txId: string,
  opts: { userId?: string; categoryId?: string } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_tx_categories
       (user_id, transaction_id, category_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [opts.userId ?? USER_ID, txId, opts.categoryId ?? "cat-x", TS, TS],
  );
}

async function seedTxSplit(
  client: SqliteMigrationClient,
  txId: string,
  opts: { userId?: string } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_tx_splits
       (user_id, transaction_id, splits_json, created_at, updated_at)
     VALUES (?, ?, '[]', ?, ?)`,
    [opts.userId ?? USER_ID, txId, TS, TS],
  );
}

async function seedMonoDebtLink(
  client: SqliteMigrationClient,
  txId: string,
  opts: { userId?: string } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_mono_debt_links
       (user_id, transaction_id, debt_ids_json, created_at, updated_at)
     VALUES (?, ?, '[]', ?, ?)`,
    [opts.userId ?? USER_ID, txId, TS, TS],
  );
}

async function seedNetworth(
  client: SqliteMigrationClient,
  month: string,
  opts: { userId?: string; networth?: number } = {},
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_networth_history
       (user_id, month, networth, snapshot_json, created_at, updated_at)
     VALUES (?, ?, ?, '{}', ?, ?)`,
    [opts.userId ?? USER_ID, month, opts.networth ?? 0, TS, TS],
  );
}

async function seedPrefs(
  client: SqliteMigrationClient,
  userId: string = USER_ID,
): Promise<void> {
  await client.run(
    `INSERT INTO finyk_prefs
       (user_id, prefs_json, monthly_plan_json, show_balance,
        created_at, updated_at)
     VALUES (?, '{}', '{}', 1, ?, ?)`,
    [userId, TS, TS],
  );
}

// -------------------- entity-class factories --------------------

function makeId(id: string): FinykIdEntry {
  return { id };
}

function makeBlob(id: string): FinykBlobEntry {
  return { id, dataJson: "{}" };
}

function makeTxCategory(transactionId: string): FinykTxCategoryEntry {
  return { transactionId, categoryId: "cat-x" };
}

function makeTxSplit(transactionId: string): FinykTxSplitsEntry {
  return { transactionId, splitsJson: "[]" };
}

function makeMonoDebtLink(transactionId: string): FinykMonoDebtLinkEntry {
  return { transactionId, debtIdsJson: "[]" };
}

function makeNetworth(month: string): FinykNetworthEntry {
  return { month, networth: 0 };
}

function makePrefs(): FinykPrefsSnapshot {
  return {
    monthlyPlanJson: "{}",
    showBalance: true,
    excludedStatTxIdsJson: "[]",
    dismissedRecurringJson: "[]",
  };
}

// -------------------- "all-zero" details fixture --------------------

const MATCH_ZEROS_DETAILS = {
  budgets: { ls: 0, sqlite: 0 },
  subscriptions: { ls: 0, sqlite: 0 },
  assets: { ls: 0, sqlite: 0 },
  debts: { ls: 0, sqlite: 0 },
  receivables: { ls: 0, sqlite: 0 },
  customCategories: { ls: 0, sqlite: 0 },
  manualExpenses: { ls: 0, sqlite: 0 },
  hiddenAccounts: { ls: 0, sqlite: 0 },
  hiddenTransactions: { ls: 0, sqlite: 0 },
  txCategories: { ls: 0, sqlite: 0 },
  txSplits: { ls: 0, sqlite: 0 },
  monoDebtLinks: { ls: 0, sqlite: 0 },
  networthHistory: { ls: 0, sqlite: 0 },
  prefs: { ls: false, sqlite: false },
};

const MISMATCH_ZEROS_DETAILS = {
  budgets: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  subscriptions: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  assets: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  debts: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  receivables: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  customCategories: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  manualExpenses: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  hiddenAccounts: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  hiddenTransactions: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  txCategories: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  txSplits: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  monoDebtLinks: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  networthHistory: { ls: 0, sqlite: 0, lsOnly: 0, sqliteOnly: 0 },
  prefs: { ls: false, sqlite: false },
};

describe("probeFinykParity", () => {
  it("reports match when both sides are empty", async () => {
    const handle = await createTestSqlite();
    try {
      const out = await probeFinykParity(handle.client, USER_ID, EMPTY_STATE);
      expect(out.result).toBe("match");
      expect(out.details).toEqual(MATCH_ZEROS_DETAILS);
    } finally {
      handle.close();
    }
  });

  it("reports match when LS and SQLite agree on every entity class", async () => {
    const handle = await createTestSqlite();
    try {
      // Seed one row per entity class.
      await seedHiddenAccount(handle.client, "acc-1");
      await seedHiddenTransaction(handle.client, "tx-h1");
      await seedBlob(handle.client, "finyk_budgets", "b1");
      await seedBlob(handle.client, "finyk_subscriptions", "s1");
      await seedBlob(handle.client, "finyk_assets", "a1");
      await seedBlob(handle.client, "finyk_debts", "d1");
      await seedBlob(handle.client, "finyk_receivables", "r1");
      await seedBlob(handle.client, "finyk_custom_categories", "cc1");
      await seedBlob(handle.client, "finyk_manual_expenses", "me1");
      await seedTxCategory(handle.client, "tx-c1");
      await seedTxSplit(handle.client, "tx-s1");
      await seedMonoDebtLink(handle.client, "tx-l1");
      await seedNetworth(handle.client, "2026-04");
      await seedPrefs(handle.client);

      const next: FinykDualWriteState = {
        hiddenAccounts: [makeId("acc-1")],
        hiddenTransactions: [makeId("tx-h1")],
        budgets: [makeBlob("b1")],
        subscriptions: [makeBlob("s1")],
        assets: [makeBlob("a1")],
        debts: [makeBlob("d1")],
        receivables: [makeBlob("r1")],
        customCategories: [makeBlob("cc1")],
        manualExpenses: [makeBlob("me1")],
        txCategories: [makeTxCategory("tx-c1")],
        txSplits: [makeTxSplit("tx-s1")],
        monoDebtLinks: [makeMonoDebtLink("tx-l1")],
        networthHistory: [makeNetworth("2026-04")],
        prefs: makePrefs(),
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        budgets: { ls: 1, sqlite: 1 },
        subscriptions: { ls: 1, sqlite: 1 },
        assets: { ls: 1, sqlite: 1 },
        debts: { ls: 1, sqlite: 1 },
        receivables: { ls: 1, sqlite: 1 },
        customCategories: { ls: 1, sqlite: 1 },
        manualExpenses: { ls: 1, sqlite: 1 },
        hiddenAccounts: { ls: 1, sqlite: 1 },
        hiddenTransactions: { ls: 1, sqlite: 1 },
        txCategories: { ls: 1, sqlite: 1 },
        txSplits: { ls: 1, sqlite: 1 },
        monoDebtLinks: { ls: 1, sqlite: 1 },
        networthHistory: { ls: 1, sqlite: 1 },
        prefs: { ls: true, sqlite: true },
      });
    } finally {
      handle.close();
    }
  });

  it("ignores soft-deleted SQLite rows in tombstone and blob tables", async () => {
    const handle = await createTestSqlite();
    try {
      // active + tombstoned rows on every soft-delete-aware table.
      await seedHiddenAccount(handle.client, "acc-1");
      await seedHiddenAccount(handle.client, "acc-2", { deletedAt: TS });
      await seedHiddenTransaction(handle.client, "tx-h1", { deletedAt: TS });
      await seedBlob(handle.client, "finyk_budgets", "b1");
      await seedBlob(handle.client, "finyk_budgets", "b2", { deletedAt: TS });
      await seedBlob(handle.client, "finyk_assets", "a1", { deletedAt: TS });

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        hiddenAccounts: [makeId("acc-1")],
        budgets: [makeBlob("b1")],
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        ...MATCH_ZEROS_DETAILS,
        hiddenAccounts: { ls: 1, sqlite: 1 },
        budgets: { ls: 1, sqlite: 1 },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with lsOnly when SQLite is missing a budget", async () => {
    const handle = await createTestSqlite();
    try {
      await seedBlob(handle.client, "finyk_budgets", "b1");

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        budgets: [makeBlob("b1"), makeBlob("b2")],
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        ...MISMATCH_ZEROS_DETAILS,
        budgets: { ls: 2, sqlite: 1, lsOnly: 1, sqliteOnly: 0 },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with sqliteOnly when SQLite has stale tx-categories", async () => {
    const handle = await createTestSqlite();
    try {
      await seedTxCategory(handle.client, "tx-1");
      await seedTxCategory(handle.client, "tx-2");
      await seedTxCategory(handle.client, "tx-3");

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        txCategories: [makeTxCategory("tx-1")],
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        ...MISMATCH_ZEROS_DETAILS,
        txCategories: { ls: 1, sqlite: 3, lsOnly: 0, sqliteOnly: 2 },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when prefs presence diverges (LS has prefs, SQLite does not)", async () => {
    const handle = await createTestSqlite();
    try {
      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        prefs: makePrefs(),
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        ...MISMATCH_ZEROS_DETAILS,
        prefs: { ls: true, sqlite: false },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when prefs presence diverges (SQLite has prefs, LS does not)", async () => {
    const handle = await createTestSqlite();
    try {
      await seedPrefs(handle.client);

      const out = await probeFinykParity(handle.client, USER_ID, EMPTY_STATE);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        ...MISMATCH_ZEROS_DETAILS,
        prefs: { ls: false, sqlite: true },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch with both lsOnly and sqliteOnly on networth-history symmetric divergence", async () => {
    const handle = await createTestSqlite();
    try {
      await seedNetworth(handle.client, "2026-03");

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        networthHistory: [makeNetworth("2026-04")],
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        ...MISMATCH_ZEROS_DETAILS,
        networthHistory: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
      });
    } finally {
      handle.close();
    }
  });

  it("scopes the read to user_id so other users' rows don't leak in", async () => {
    const handle = await createTestSqlite();
    try {
      // Other-user noise across every soft-delete-aware and per-tx
      // table — none of these should appear in user-1's parity tally.
      await seedHiddenAccount(handle.client, "acc-other", {
        userId: "user-2",
      });
      await seedHiddenTransaction(handle.client, "tx-other", {
        userId: "user-2",
      });
      await seedBlob(handle.client, "finyk_budgets", "b-other", {
        userId: "user-2",
      });
      await seedBlob(handle.client, "finyk_subscriptions", "s-other", {
        userId: "user-2",
      });
      await seedBlob(handle.client, "finyk_debts", "d-other", {
        userId: "user-2",
      });
      await seedTxCategory(handle.client, "tx-other-c", { userId: "user-2" });
      await seedTxSplit(handle.client, "tx-other-s", { userId: "user-2" });
      await seedMonoDebtLink(handle.client, "tx-other-l", {
        userId: "user-2",
      });
      await seedNetworth(handle.client, "2026-04", { userId: "user-2" });
      await seedPrefs(handle.client, "user-2");

      // user-1's own row.
      await seedBlob(handle.client, "finyk_budgets", "b1");

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        budgets: [makeBlob("b1")],
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        ...MATCH_ZEROS_DETAILS,
        budgets: { ls: 1, sqlite: 1 },
      });
    } finally {
      handle.close();
    }
  });

  it("ignores LS entries with empty or non-string ids on blob and per-tx tables", async () => {
    const handle = await createTestSqlite();
    try {
      await seedBlob(handle.client, "finyk_budgets", "b1");
      await seedTxCategory(handle.client, "tx-c1");

      // Inject malformed entries past the type-check. The probe must
      // defensively skip them rather than surface a phantom mismatch.
      const malformedBudgets = [
        makeBlob("b1"),
        { ...makeBlob(""), id: "" },
        { ...makeBlob("ignored"), id: 42 },
        null,
      ] as unknown as readonly FinykBlobEntry[];

      const malformedTxCategories = [
        makeTxCategory("tx-c1"),
        { transactionId: "", categoryId: "x" },
        { transactionId: 7, categoryId: "x" },
        undefined,
      ] as unknown as readonly FinykTxCategoryEntry[];

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        budgets: malformedBudgets,
        txCategories: malformedTxCategories,
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        ...MATCH_ZEROS_DETAILS,
        budgets: { ls: 1, sqlite: 1 },
        txCategories: { ls: 1, sqlite: 1 },
      });
    } finally {
      handle.close();
    }
  });

  it("reports mismatch when only the time-series month differs across many entity classes", async () => {
    // Multi-bucket mismatch — confirms each bucket gets its own
    // lsOnly / sqliteOnly tally rather than a global aggregate.
    const handle = await createTestSqlite();
    try {
      await seedBlob(handle.client, "finyk_assets", "a-stale");
      await seedBlob(handle.client, "finyk_debts", "d1");
      await seedTxSplit(handle.client, "tx-1");
      await seedNetworth(handle.client, "2026-03");

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        // assets diverge — LS has none, SQLite has a-stale
        // debts match — both have d1
        debts: [makeBlob("d1")],
        // txSplits match — both have tx-1
        txSplits: [makeTxSplit("tx-1")],
        // networthHistory diverges — LS=2026-04, SQLite=2026-03
        networthHistory: [makeNetworth("2026-04")],
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("mismatch");
      expect(out.details).toEqual({
        ...MISMATCH_ZEROS_DETAILS,
        assets: { ls: 0, sqlite: 1, lsOnly: 0, sqliteOnly: 1 },
        debts: { ls: 1, sqlite: 1, lsOnly: 0, sqliteOnly: 0 },
        txSplits: { ls: 1, sqlite: 1, lsOnly: 0, sqliteOnly: 0 },
        networthHistory: { ls: 1, sqlite: 1, lsOnly: 1, sqliteOnly: 1 },
      });
    } finally {
      handle.close();
    }
  });

  it("reports match when LS prefs object is set with falsy showBalance flag", async () => {
    // Defensive: prefs presence is a boolean — the probe must NOT
    // shortcut on `next.prefs?.showBalance` semantics. A prefs object
    // with `showBalance: false` is still "present".
    const handle = await createTestSqlite();
    try {
      await seedPrefs(handle.client);

      const next: FinykDualWriteState = {
        ...EMPTY_STATE,
        prefs: {
          monthlyPlanJson: "{}",
          showBalance: false,
          excludedStatTxIdsJson: "[]",
          dismissedRecurringJson: "[]",
        },
      };

      const out = await probeFinykParity(handle.client, USER_ID, next);
      expect(out.result).toBe("match");
      expect(out.details).toEqual({
        ...MATCH_ZEROS_DETAILS,
        prefs: { ls: true, sqlite: true },
      });
    } finally {
      handle.close();
    }
  });
});
