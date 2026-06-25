import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { PoolClient } from "pg";
import type { SyncV2Op } from "../../http/schemas.js";
import {
  applyFinykAssets,
  applyFinykBudgets,
  applyFinykCustomCategories,
  applyFinykDebts,
  applyFinykHiddenAccounts,
  applyFinykHiddenTransactions,
  applyFinykManualExpenses,
  applyFinykMonoDebtLinks,
  applyFinykNetworthHistory,
  applyFinykPrefs,
  applyFinykReceivables,
  applyFinykSubscriptions,
  applyFinykTxCategories,
  applyFinykTxFilters,
  applyFinykTxSplits,
} from "./finyk/applySync.js";
import {
  applyFizrukCustomExercises,
  applyFizrukItems,
  applyFizrukMeasurements,
  applyFizrukSets,
  applyFizrukWorkouts,
} from "./fizruk/applySync.js";
import {
  applyNutritionMeals,
  applyNutritionPantries,
  applyNutritionPantryItems,
  applyNutritionPrefs,
  applyNutritionRecipes,
} from "./nutrition/applySync.js";
import {
  applyRoutineEntries,
  applyRoutineStreaks,
} from "./routine/applySync.js";

const USER_ID = "user-1";
const CLIENT_TS = new Date("2026-06-24T10:00:00.000Z");
const OLD_TS = new Date("2026-06-24T09:00:00.000Z");
const NEWER_TS = new Date("2026-06-24T11:00:00.000Z");

interface ClientStub extends PoolClient {
  query: Mock;
}

function makeClient(
  ...rowSets: Array<Array<Record<string, unknown>>>
): ClientStub {
  const query = vi.fn();
  for (const rows of rowSets) {
    query.mockResolvedValueOnce({ rows });
  }
  query.mockResolvedValue({ rows: [] });
  return { query } as unknown as ClientStub;
}

function op(
  row: Record<string, unknown>,
  kind: "insert" | "update" | "delete" | "increment" = "insert",
): SyncV2Op {
  return {
    table: "finyk_budgets",
    op: kind,
    row,
    client_ts: CLIENT_TS.toISOString(),
    idempotency_key: `k-${kind}`,
  } as unknown as SyncV2Op;
}

function existing(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    user_id: USER_ID,
    updated_at: OLD_TS,
    deleted_at: null,
    ...overrides,
  };
}

function sql(client: ClientStub, callIndex = 1): string {
  return String(client.query.mock.calls[callIndex]?.[0] ?? "");
}

describe("finyk applySync", () => {
  it("applies hidden-account inserts after user and LWW validation", async () => {
    const client = makeClient([]);

    const result = await applyFinykHiddenAccounts(
      client,
      op({ user_id: USER_ID, account_id: "acc-1" }),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "applied" });
    expect(sql(client)).toContain("INSERT INTO finyk_hidden_accounts");
    expect(client.query.mock.calls[1]?.[1]).toEqual([
      USER_ID,
      "acc-1",
      CLIENT_TS,
      CLIENT_TS,
      null,
    ]);
  });

  it("rejects hidden-account tombstones that are missing or stale", async () => {
    await expect(
      applyFinykHiddenAccounts(
        makeClient(),
        op({ account_id: "acc-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFinykHiddenAccounts(
        makeClient(),
        op({ user_id: "other-user", account_id: "acc-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFinykHiddenAccounts(
        makeClient(),
        op({ user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_ext_id" });

    await expect(
      applyFinykHiddenAccounts(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ user_id: USER_ID, account_id: "acc-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFinykHiddenAccounts(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ user_id: USER_ID, account_id: "acc-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFinykHiddenAccounts(
        makeClient([]),
        op({ user_id: USER_ID, account_id: "acc-1" }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFinykHiddenAccounts(
          makeClient([]),
          op({ user_id: USER_ID, account_id: "acc-1", [field]: "nope" }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }
  });

  it("marks existing hidden accounts deleted", async () => {
    const client = makeClient([existing()]);

    const result = await applyFinykHiddenAccounts(
      client,
      op({ user_id: USER_ID, account_id: "acc-1" }, "delete"),
      USER_ID,
      CLIENT_TS,
    );

    expect(result).toEqual({ status: "applied" });
    expect(sql(client)).toContain("SET deleted_at = $1");

    const updateClient = makeClient([existing()]);
    await expect(
      applyFinykHiddenAccounts(
        updateClient,
        op({ user_id: USER_ID, account_id: "acc-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE finyk_hidden_accounts");
  });

  it("applies per-row blob insert and update paths", async () => {
    const insertClient = makeClient([]);
    await expect(
      applyFinykBudgets(
        insertClient,
        op({ id: "budget-1", user_id: USER_ID, data_json: { limit: 1000 } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO finyk_budgets");
    expect(insertClient.query.mock.calls[1]?.[1]?.[2]).toBe('{"limit":1000}');

    const updateClient = makeClient([existing()]);
    await expect(
      applyFinykBudgets(
        updateClient,
        op({
          id: "budget-1",
          user_id: USER_ID,
          data_json: { limit: 2000 },
          deleted_at: null,
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE finyk_budgets");
  });

  it("routes all finyk per-row blob wrappers through the shared insert path", async () => {
    const wrappers = [
      [applyFinykSubscriptions, "finyk_subscriptions"],
      [applyFinykAssets, "finyk_assets"],
      [applyFinykDebts, "finyk_debts"],
      [applyFinykReceivables, "finyk_receivables"],
      [applyFinykCustomCategories, "finyk_custom_categories"],
      [applyFinykManualExpenses, "finyk_manual_expenses"],
      [applyFinykTxFilters, "finyk_tx_filters"],
    ] as const;

    for (const [apply, tableName] of wrappers) {
      const client = makeClient([]);
      await expect(
        apply(
          client,
          op({
            id: `${tableName}-1`,
            user_id: USER_ID,
            data_json: { tableName },
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "applied" });
      expect(sql(client)).toContain(`INSERT INTO ${tableName}`);
    }
  });

  it("rejects per-row blobs with bad ownership, missing payloads, and tombstones", async () => {
    await expect(
      applyFinykBudgets(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyFinykBudgets(
        makeClient(),
        op({ id: "budget-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFinykBudgets(
        makeClient(),
        op({ id: "budget-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFinykBudgets(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "budget-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyFinykBudgets(
        makeClient([]),
        op({ id: "budget-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_data_json" });

    await expect(
      applyFinykBudgets(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "budget-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFinykBudgets(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "budget-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFinykBudgets(
        makeClient([]),
        op({ id: "budget-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFinykBudgets(
          makeClient([]),
          op({
            id: `budget-${field}`,
            user_id: USER_ID,
            data_json: {},
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFinykBudgets(
        deleteClient,
        op({ id: "budget-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient)).toContain("UPDATE finyk_budgets");
  });

  it("applies transaction category upserts and deletes", async () => {
    const upsertClient = makeClient([]);
    await expect(
      applyFinykTxCategories(
        upsertClient,
        op({
          user_id: USER_ID,
          transaction_id: "tx-1",
          category_id: "cat-1",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(upsertClient)).toContain("ON CONFLICT");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFinykTxCategories(
        deleteClient,
        op({ user_id: USER_ID, transaction_id: "tx-1" }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient)).toContain("DELETE FROM finyk_tx_categories");
  });

  it("rejects transaction categories before writes when required fields fail", async () => {
    await expect(
      applyFinykTxCategories(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_tx_id" });

    await expect(
      applyFinykTxCategories(
        makeClient([]),
        op({ user_id: USER_ID, transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({
      status: "rejected",
      reason: "missing_category_id",
    });

    await expect(
      applyFinykTxCategories(
        makeClient(),
        op({ transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFinykTxCategories(
        makeClient(),
        op({ user_id: "other-user", transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFinykTxCategories(
        makeClient([{ updated_at: NEWER_TS }]),
        op({
          user_id: USER_ID,
          transaction_id: "tx-1",
          category_id: "cat-1",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });
  });

  it("defaults json array sync values and rejects stale rows", async () => {
    await expect(
      applyFinykTxSplits(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_tx_id" });

    await expect(
      applyFinykTxSplits(
        makeClient(),
        op({ transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFinykTxSplits(
        makeClient(),
        op({ user_id: "other-user", transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const client = makeClient([]);
    await expect(
      applyFinykTxSplits(
        client,
        op({ user_id: USER_ID, transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(client.query.mock.calls[1]?.[1]?.[2]).toBe("[]");

    await expect(
      applyFinykTxSplits(
        makeClient([{ updated_at: NEWER_TS }]),
        op({ user_id: USER_ID, transaction_id: "tx-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    const deleteClient = makeClient([]);
    await expect(
      applyFinykTxSplits(
        deleteClient,
        op({ user_id: USER_ID, transaction_id: "tx-1" }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient, 0)).toContain("SELECT updated_at");
    expect(sql(deleteClient, 1)).toContain("DELETE FROM finyk_tx_splits");
  });

  it("applies hidden transaction and mono debt-link wrappers", async () => {
    const hiddenClient = makeClient([]);
    await expect(
      applyFinykHiddenTransactions(
        hiddenClient,
        op({ user_id: USER_ID, transaction_id: "tx-hidden" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(hiddenClient)).toContain(
      "INSERT INTO finyk_hidden_transactions",
    );

    const linkClient = makeClient([]);
    await expect(
      applyFinykMonoDebtLinks(
        linkClient,
        op({
          user_id: USER_ID,
          transaction_id: "tx-link",
          debt_ids_json: ["debt-1"],
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(linkClient)).toContain("INSERT INTO finyk_mono_debt_links");
    expect(linkClient.query.mock.calls[1]?.[1]?.[2]).toBe('["debt-1"]');
  });

  it("validates and applies networth history rows", async () => {
    await expect(
      applyFinykNetworthHistory(
        makeClient(),
        op({ user_id: USER_ID, month: "2026-6" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_month" });

    await expect(
      applyFinykNetworthHistory(
        makeClient(),
        op({ month: "2026-06" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFinykNetworthHistory(
        makeClient(),
        op({ month: "2026-06", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFinykNetworthHistory(
        makeClient([{ updated_at: NEWER_TS }]),
        op({ user_id: USER_ID, month: "2026-06", networth: "123.45" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFinykNetworthHistory(
        makeClient([]),
        op({ user_id: USER_ID, month: "2026-06", networth: "bad" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_networth" });

    const client = makeClient([]);
    await expect(
      applyFinykNetworthHistory(
        client,
        op({ user_id: USER_ID, month: "2026-06", networth: "123.45" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("INSERT INTO finyk_networth_history");

    const deleteClient = makeClient([]);
    await expect(
      applyFinykNetworthHistory(
        deleteClient,
        op({ user_id: USER_ID, month: "2026-06" }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient, 1)).toContain(
      "DELETE FROM finyk_networth_history",
    );
  });

  it("applies prefs insert/update and rejects unsupported deletes", async () => {
    await expect(
      applyFinykPrefs(
        makeClient(),
        op({ user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({
      status: "rejected",
      reason: "delete_not_supported",
    });

    await expect(
      applyFinykPrefs(makeClient(), op({}), USER_ID, CLIENT_TS),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFinykPrefs(
        makeClient(),
        op({ user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFinykPrefs(
        makeClient([{ updated_at: NEWER_TS }]),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    const insertClient = makeClient([]);
    await expect(
      applyFinykPrefs(
        insertClient,
        op({ user_id: USER_ID, show_balance: 0 }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO finyk_prefs");
    expect(insertClient.query.mock.calls[1]?.[1]?.[3]).toBe(false);

    const updateClient = makeClient([{ updated_at: OLD_TS }]);
    await expect(
      applyFinykPrefs(
        updateClient,
        op({ user_id: USER_ID, prefs_json: { currency: "UAH" } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE finyk_prefs");
  });
});

describe("nutrition applySync", () => {
  it("applies meal insert/update/delete and validates required date/macros", async () => {
    await expect(
      applyNutritionMeals(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyNutritionMeals(
        makeClient(),
        op({ id: "meal-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyNutritionMeals(
        makeClient(),
        op({ id: "meal-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyNutritionMeals(
        makeClient([existing({ user_id: "other-user" })]),
        op({
          id: "meal-1",
          user_id: USER_ID,
          eaten_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyNutritionMeals(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({
          id: "meal-1",
          user_id: USER_ID,
          eaten_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyNutritionMeals(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({
          id: "meal-1",
          user_id: USER_ID,
          eaten_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyNutritionMeals(
        makeClient([]),
        op({ id: "meal-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyNutritionMeals(
        makeClient([]),
        op({ id: "meal-1", user_id: USER_ID, eaten_at: "bad-date" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_eaten_at" });

    await expect(
      applyNutritionMeals(
        makeClient([]),
        op({
          id: "meal-1",
          user_id: USER_ID,
          eaten_at: CLIENT_TS.toISOString(),
          kcal: "nope",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_kcal" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
      ["protein_g", "invalid_protein_g"],
      ["fat_g", "invalid_fat_g"],
      ["carbs_g", "invalid_carbs_g"],
      ["amount_g", "invalid_amount_g"],
    ] as const) {
      await expect(
        applyNutritionMeals(
          makeClient([]),
          op({
            id: `meal-${field}`,
            user_id: USER_ID,
            eaten_at: CLIENT_TS.toISOString(),
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const insertClient = makeClient([]);
    await expect(
      applyNutritionMeals(
        insertClient,
        op({
          id: "meal-1",
          user_id: USER_ID,
          eaten_at: CLIENT_TS.toISOString(),
          kcal: "250",
          protein_g: 10,
          is_demo: 1,
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO nutrition_meals");

    const updateClient = makeClient([existing()]);
    await expect(
      applyNutritionMeals(
        updateClient,
        op({
          id: "meal-1",
          user_id: USER_ID,
          eaten_at: CLIENT_TS.toISOString(),
          carbs_g: 12,
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE nutrition_meals");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyNutritionMeals(
        deleteClient,
        op({ id: "meal-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("applies pantries and rejects missing ownership", async () => {
    await expect(
      applyNutritionPantries(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyNutritionPantries(
        makeClient(),
        op({ id: "pantry-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyNutritionPantries(
        makeClient(),
        op({ id: "pantry-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyNutritionPantries(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "pantry-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyNutritionPantries(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "pantry-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyNutritionPantries(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "pantry-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyNutritionPantries(
        makeClient([]),
        op({ id: "pantry-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyNutritionPantries(
          makeClient([]),
          op({ id: `pantry-${field}`, user_id: USER_ID, [field]: "nope" }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const client = makeClient([]);
    await expect(
      applyNutritionPantries(
        client,
        op({ id: "pantry-1", user_id: USER_ID, name: "Home", text: "Shelf" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("INSERT INTO nutrition_pantries");

    const updateClient = makeClient([existing()]);
    await expect(
      applyNutritionPantries(
        updateClient,
        op({ id: "pantry-1", user_id: USER_ID, name: "Office" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE nutrition_pantries");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyNutritionPantries(
        deleteClient,
        op({ id: "pantry-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("validates pantry items and applies writes", async () => {
    await expect(
      applyNutritionPantryItems(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyNutritionPantryItems(
        makeClient(),
        op({ id: "item-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyNutritionPantryItems(
        makeClient(),
        op({ id: "item-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyNutritionPantryItems(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "item-1", user_id: USER_ID, pantry_id: "p-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyNutritionPantryItems(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "item-1", user_id: USER_ID, pantry_id: "p-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyNutritionPantryItems(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "item-1", user_id: USER_ID, pantry_id: "p-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyNutritionPantryItems(
        makeClient([]),
        op({ id: "item-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyNutritionPantryItems(
        makeClient([]),
        op({ id: "item-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_pantry_id" });

    await expect(
      applyNutritionPantryItems(
        makeClient([]),
        op({ id: "item-1", user_id: USER_ID, pantry_id: "p-1", qty: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_qty" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyNutritionPantryItems(
          makeClient([]),
          op({
            id: `item-${field}`,
            user_id: USER_ID,
            pantry_id: "p-1",
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const client = makeClient([]);
    await expect(
      applyNutritionPantryItems(
        client,
        op({
          id: "item-1",
          user_id: USER_ID,
          pantry_id: "p-1",
          name: "Buckwheat",
          qty: "2.5",
          sort_order: -1,
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("INSERT INTO nutrition_pantry_items");
    expect(client.query.mock.calls[1]?.[1]?.[7]).toBe(0);

    const updateClient = makeClient([existing()]);
    await expect(
      applyNutritionPantryItems(
        updateClient,
        op({ id: "item-1", user_id: USER_ID, pantry_id: "p-2", qty: "3" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE nutrition_pantry_items");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyNutritionPantryItems(
        deleteClient,
        op({ id: "item-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("applies prefs insert/update and rejects stale prefs", async () => {
    await expect(
      applyNutritionPrefs(
        makeClient([{ updated_at: NEWER_TS }]),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyNutritionPrefs(makeClient(), op({}), USER_ID, CLIENT_TS),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyNutritionPrefs(
        makeClient(),
        op({ user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    const insertClient = makeClient([]);
    await expect(
      applyNutritionPrefs(
        insertClient,
        op({ user_id: USER_ID, prefs_json: { kcal: 2200 } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO nutrition_prefs");

    const updateClient = makeClient([{ updated_at: OLD_TS }]);
    await expect(
      applyNutritionPrefs(
        updateClient,
        op({ user_id: USER_ID, active_pantry_id: "p-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE nutrition_prefs");
  });

  it("validates recipes and applies delete/write paths", async () => {
    await expect(
      applyNutritionRecipes(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyNutritionRecipes(
        makeClient(),
        op({ id: "recipe-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyNutritionRecipes(
        makeClient(),
        op({ id: "recipe-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyNutritionRecipes(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "recipe-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyNutritionRecipes(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "recipe-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyNutritionRecipes(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "recipe-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyNutritionRecipes(
        makeClient([]),
        op({ id: "recipe-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyNutritionRecipes(
        makeClient([]),
        op({ id: "recipe-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_data_json" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyNutritionRecipes(
          makeClient([]),
          op({
            id: `recipe-${field}`,
            user_id: USER_ID,
            data_json: {},
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const client = makeClient([]);
    await expect(
      applyNutritionRecipes(
        client,
        op({ id: "recipe-1", user_id: USER_ID, data_json: { steps: [] } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("INSERT INTO nutrition_recipes");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyNutritionRecipes(
        deleteClient,
        op({ id: "recipe-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });

    const updateClient = makeClient([existing()]);
    await expect(
      applyNutritionRecipes(
        updateClient,
        op({ id: "recipe-1", user_id: USER_ID, data_json: { steps: [1] } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE nutrition_recipes");
  });
});

describe("fizruk applySync", () => {
  it("validates and applies workouts", async () => {
    await expect(
      applyFizrukWorkouts(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyFizrukWorkouts(
        makeClient(),
        op({ id: "workout-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFizrukWorkouts(
        makeClient(),
        op({ id: "workout-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFizrukWorkouts(
        makeClient([existing({ user_id: "other-user" })]),
        op({
          id: "workout-1",
          user_id: USER_ID,
          started_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyFizrukWorkouts(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({
          id: "workout-1",
          user_id: USER_ID,
          started_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFizrukWorkouts(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({
          id: "workout-1",
          user_id: USER_ID,
          started_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFizrukWorkouts(
        makeClient([]),
        op({ id: "workout-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyFizrukWorkouts(
        makeClient([]),
        op({ id: "workout-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_started_at" });

    for (const [field, reason] of [
      ["ended_at", "invalid_ended_at"],
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFizrukWorkouts(
          makeClient([]),
          op({
            id: `workout-${field}`,
            user_id: USER_ID,
            started_at: CLIENT_TS.toISOString(),
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const insertClient = makeClient([]);
    await expect(
      applyFizrukWorkouts(
        insertClient,
        op({
          id: "workout-1",
          user_id: USER_ID,
          started_at: CLIENT_TS.toISOString(),
          groups_json: ["legs"],
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO fizruk_workouts");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFizrukWorkouts(
        deleteClient,
        op({ id: "workout-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient)).toContain("UPDATE fizruk_workouts");

    const updateClient = makeClient([existing()]);
    await expect(
      applyFizrukWorkouts(
        updateClient,
        op({
          id: "workout-1",
          user_id: USER_ID,
          started_at: CLIENT_TS.toISOString(),
          ended_at: NEWER_TS.toISOString(),
          note: "Done",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE fizruk_workouts");
  });

  it("validates workout items and applies update", async () => {
    await expect(
      applyFizrukItems(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyFizrukItems(makeClient(), op({ id: "item-1" }), USER_ID, CLIENT_TS),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFizrukItems(
        makeClient(),
        op({ id: "item-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFizrukItems(
        makeClient([existing({ user_id: "other-user" })]),
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          name_uk: "Squat",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyFizrukItems(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          name_uk: "Squat",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFizrukItems(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          name_uk: "Squat",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFizrukItems(
        makeClient([]),
        op({ id: "item-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyFizrukItems(
        makeClient([]),
        op({ id: "item-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_workout_id" });

    await expect(
      applyFizrukItems(
        makeClient([]),
        op({ id: "item-1", user_id: USER_ID, workout_id: "workout-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_exercise_id" });

    await expect(
      applyFizrukItems(
        makeClient([]),
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_name_uk" });

    await expect(
      applyFizrukItems(
        makeClient([]),
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          name_uk: "Squat",
          duration_sec: {},
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_duration_sec" });

    for (const [field, reason] of [
      ["distance_m", "invalid_distance_m"],
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFizrukItems(
          makeClient([]),
          op({
            id: `item-${field}`,
            user_id: USER_ID,
            workout_id: "workout-1",
            exercise_id: "exercise-1",
            name_uk: "Squat",
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const insertClient = makeClient([]);
    await expect(
      applyFizrukItems(
        insertClient,
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          name_uk: "Squat",
          muscles_primary: ["legs"],
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO fizruk_workout_items");

    const client = makeClient([existing()]);
    await expect(
      applyFizrukItems(
        client,
        op({
          id: "item-1",
          user_id: USER_ID,
          workout_id: "workout-1",
          exercise_id: "exercise-1",
          name_uk: "Squat",
          distance_m: "1200",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("UPDATE fizruk_workout_items");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFizrukItems(
        deleteClient,
        op({ id: "item-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("validates sets and applies insert/delete", async () => {
    await expect(
      applyFizrukSets(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyFizrukSets(makeClient(), op({ id: "set-1" }), USER_ID, CLIENT_TS),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFizrukSets(
        makeClient(),
        op({ id: "set-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFizrukSets(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "set-1", user_id: USER_ID, workout_item_id: "item-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyFizrukSets(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "set-1", user_id: USER_ID, workout_item_id: "item-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFizrukSets(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "set-1", user_id: USER_ID, workout_item_id: "item-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFizrukSets(
        makeClient([]),
        op({ id: "set-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyFizrukSets(
        makeClient([]),
        op({ id: "set-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({
      status: "rejected",
      reason: "missing_workout_item_id",
    });

    await expect(
      applyFizrukSets(
        makeClient([]),
        op({
          id: "set-1",
          user_id: USER_ID,
          workout_item_id: "item-1",
          weight_kg: {},
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_weight_kg" });

    for (const [field, reason] of [
      ["reps", "invalid_reps"],
      ["rpe", "invalid_rpe"],
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFizrukSets(
          makeClient([]),
          op({
            id: `set-${field}`,
            user_id: USER_ID,
            workout_item_id: "item-1",
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const insertClient = makeClient([]);
    await expect(
      applyFizrukSets(
        insertClient,
        op({
          id: "set-1",
          user_id: USER_ID,
          workout_item_id: "item-1",
          reps: "10",
          rpe: "8.5",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO fizruk_workout_sets");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFizrukSets(
        deleteClient,
        op({ id: "set-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });

    const updateClient = makeClient([existing()]);
    await expect(
      applyFizrukSets(
        updateClient,
        op({
          id: "set-1",
          user_id: USER_ID,
          workout_item_id: "item-1",
          weight_kg: "42.5",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE fizruk_workout_sets");
  });

  it("validates custom exercises and applies writes", async () => {
    await expect(
      applyFizrukCustomExercises(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyFizrukCustomExercises(
        makeClient(),
        op({ id: "exercise-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFizrukCustomExercises(
        makeClient(),
        op({ id: "exercise-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFizrukCustomExercises(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "exercise-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyFizrukCustomExercises(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "exercise-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFizrukCustomExercises(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "exercise-1", user_id: USER_ID, data_json: {} }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFizrukCustomExercises(
        makeClient([]),
        op({ id: "exercise-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyFizrukCustomExercises(
        makeClient([]),
        op({ id: "exercise-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_data_json" });

    for (const [field, reason] of [
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFizrukCustomExercises(
          makeClient([]),
          op({
            id: `exercise-${field}`,
            user_id: USER_ID,
            data_json: {},
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const client = makeClient([]);
    await expect(
      applyFizrukCustomExercises(
        client,
        op({ id: "exercise-1", user_id: USER_ID, data_json: { name: "Curl" } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("INSERT INTO fizruk_custom_exercises");

    const updateClient = makeClient([existing()]);
    await expect(
      applyFizrukCustomExercises(
        updateClient,
        op({ id: "exercise-1", user_id: USER_ID, data_json: { name: "Row" } }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE fizruk_custom_exercises");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFizrukCustomExercises(
        deleteClient,
        op({ id: "exercise-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });

  it("validates measurements and applies update", async () => {
    await expect(
      applyFizrukMeasurements(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyFizrukMeasurements(
        makeClient(),
        op({ id: "measure-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyFizrukMeasurements(
        makeClient(),
        op({ id: "measure-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyFizrukMeasurements(
        makeClient([existing({ user_id: "other-user" })]),
        op({
          id: "measure-1",
          user_id: USER_ID,
          measured_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyFizrukMeasurements(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({
          id: "measure-1",
          user_id: USER_ID,
          measured_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyFizrukMeasurements(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({
          id: "measure-1",
          user_id: USER_ID,
          measured_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyFizrukMeasurements(
        makeClient([]),
        op({ id: "measure-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "not_found" });

    await expect(
      applyFizrukMeasurements(
        makeClient([]),
        op({ id: "measure-1", user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_measured_at" });

    await expect(
      applyFizrukMeasurements(
        makeClient([]),
        op({
          id: "measure-1",
          user_id: USER_ID,
          measured_at: CLIENT_TS.toISOString(),
          waist_cm: {},
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_waist_cm" });

    for (const [field, reason] of [
      ["weight_kg", "invalid_weight_kg"],
      ["chest_cm", "invalid_chest_cm"],
      ["hips_cm", "invalid_hips_cm"],
      ["bicep_cm", "invalid_bicep_cm"],
      ["sleep_hours", "invalid_sleep_hours"],
      ["energy_level", "invalid_energy_level"],
      ["mood", "invalid_mood"],
      ["created_at", "invalid_created_at"],
      ["deleted_at", "invalid_deleted_at"],
    ] as const) {
      await expect(
        applyFizrukMeasurements(
          makeClient([]),
          op({
            id: `measure-${field}`,
            user_id: USER_ID,
            measured_at: CLIENT_TS.toISOString(),
            [field]: "nope",
          }),
          USER_ID,
          CLIENT_TS,
        ),
      ).resolves.toEqual({ status: "rejected", reason });
    }

    const insertClient = makeClient([]);
    await expect(
      applyFizrukMeasurements(
        insertClient,
        op({
          id: "measure-1",
          user_id: USER_ID,
          measured_at: CLIENT_TS.toISOString(),
          weight_kg: "80.5",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO fizruk_measurements");

    const client = makeClient([existing()]);
    await expect(
      applyFizrukMeasurements(
        client,
        op({
          id: "measure-1",
          user_id: USER_ID,
          measured_at: CLIENT_TS.toISOString(),
          weight_kg: "80.5",
          energy_level: "4",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(client)).toContain("UPDATE fizruk_measurements");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyFizrukMeasurements(
        deleteClient,
        op({ id: "measure-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
  });
});

describe("routine applySync", () => {
  it("validates routine entries before writes", async () => {
    await expect(
      applyRoutineEntries(
        makeClient(),
        op({ user_id: USER_ID }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_id" });

    await expect(
      applyRoutineEntries(
        makeClient(),
        op({ id: "entry-1" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyRoutineEntries(
        makeClient(),
        op({ id: "entry-1", user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });
  });

  it("applies routine entry insert/update/delete paths", async () => {
    const insertClient = makeClient([]);
    await expect(
      applyRoutineEntries(
        insertClient,
        op({
          id: "entry-1",
          user_id: USER_ID,
          name: "Drink water",
          completed_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(insertClient)).toContain("INSERT INTO routine_entries");

    const updateClient = makeClient([existing()]);
    await expect(
      applyRoutineEntries(
        updateClient,
        op({ id: "entry-1", user_id: USER_ID, name: "Walk" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(updateClient)).toContain("UPDATE routine_entries");

    const deleteClient = makeClient([existing()]);
    await expect(
      applyRoutineEntries(
        deleteClient,
        op({ id: "entry-1", user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient)).toContain("SET deleted_at = $1");
  });

  it("rejects routine entry conflicts, tombstones, and bad dates", async () => {
    await expect(
      applyRoutineEntries(
        makeClient([existing({ user_id: "other-user" })]),
        op({ id: "entry-1", user_id: USER_ID, name: "Walk" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "fk_violation" });

    await expect(
      applyRoutineEntries(
        makeClient([existing({ updated_at: NEWER_TS })]),
        op({ id: "entry-1", user_id: USER_ID, name: "Walk" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    await expect(
      applyRoutineEntries(
        makeClient([existing({ deleted_at: OLD_TS })]),
        op({ id: "entry-1", user_id: USER_ID, name: "Walk" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "tombstoned" });

    await expect(
      applyRoutineEntries(
        makeClient([]),
        op({
          id: "entry-1",
          user_id: USER_ID,
          name: "Walk",
          completed_at: "not-a-date",
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({
      status: "rejected",
      reason: "invalid_completed_at",
    });
  });

  it("applies routine streak increments without LWW blocking", async () => {
    const positiveClient = makeClient();
    await expect(
      applyRoutineStreaks(
        positiveClient,
        op({ user_id: USER_ID, delta: 1 }, "increment"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(String(positiveClient.query.mock.calls[0]?.[0])).toContain(
      "ON CONFLICT (user_id) DO UPDATE",
    );
    expect(positiveClient.query.mock.calls[0]?.[1]).toEqual([USER_ID, 1]);

    const negativeClient = makeClient();
    await expect(
      applyRoutineStreaks(
        negativeClient,
        op({ user_id: USER_ID, delta: -1 }, "increment"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(negativeClient.query.mock.calls[0]?.[1]).toEqual([USER_ID, -1]);
  });

  it("rejects invalid routine streak increments", async () => {
    await expect(
      applyRoutineStreaks(
        makeClient(),
        op({ user_id: USER_ID }, "increment"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "missing_delta" });

    await expect(
      applyRoutineStreaks(
        makeClient(),
        op({ user_id: USER_ID, delta: 1001 }, "increment"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_delta" });
  });

  it("applies routine streak upsert/delete and rejects stale aggregate writes", async () => {
    await expect(
      applyRoutineStreaks(
        makeClient([{ max_ts: NEWER_TS }]),
        op({ user_id: USER_ID, current_streak: 3 }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "lww_conflict" });

    const upsertClient = makeClient([{ max_ts: OLD_TS }]);
    await expect(
      applyRoutineStreaks(
        upsertClient,
        op({
          user_id: USER_ID,
          current_streak: 3.8,
          longest_streak: -2,
          last_completed_at: CLIENT_TS.toISOString(),
        }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(upsertClient)).toContain("INSERT INTO routine_streaks");
    expect(upsertClient.query.mock.calls[1]?.[1]).toEqual([
      USER_ID,
      3,
      0,
      CLIENT_TS,
    ]);

    const deleteClient = makeClient([{ max_ts: null }]);
    await expect(
      applyRoutineStreaks(
        deleteClient,
        op({ user_id: USER_ID }, "delete"),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "applied" });
    expect(sql(deleteClient)).toContain("DELETE FROM routine_streaks");
  });

  it("validates routine streak ownership and date fields", async () => {
    await expect(
      applyRoutineStreaks(makeClient(), op({}), USER_ID, CLIENT_TS),
    ).resolves.toEqual({ status: "rejected", reason: "missing_user_id" });

    await expect(
      applyRoutineStreaks(
        makeClient(),
        op({ user_id: "other-user" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "user_id_mismatch" });

    await expect(
      applyRoutineStreaks(
        makeClient([{ max_ts: null }]),
        op({ user_id: USER_ID, last_completed_at: "invalid" }),
        USER_ID,
        CLIENT_TS,
      ),
    ).resolves.toEqual({
      status: "rejected",
      reason: "invalid_last_completed_at",
    });
  });
});
