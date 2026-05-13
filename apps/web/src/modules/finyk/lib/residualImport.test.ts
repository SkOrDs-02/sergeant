/**
 * Юніт-тести для `apps/web/src/modules/finyk/lib/residualImport.ts`.
 *
 * Файл — boot-time helper, який забирає залишки даних із LS-ключів
 * Finyk-домену й заливає їх у локальний SQLite через dual-write адаптер
 * (PR #057k-tombstone, Stage 13 / PR #075 додав два префс-ключі).
 *
 * Тут покриваємо:
 *   - `importFinykResidualFromLs` (early-return / happy path / cleanup
 *     після `apply` / LS збереження при падінні `apply` / log-формат)
 *   - per-slot LS читачі (через спостереження за SQLite-таблицями):
 *     id-таблиці, blob-таблиці, tx_cats / tx_splits / mono_debt_links,
 *     networth_history, prefs (`monthly_plan` + `show_balance_v1` +
 *     `excluded_stat_txs` + `rec_dismissed`).
 *   - захисні гілки: невалідні форми JSON, не-масиви, не-обʼєкти,
 *     обірваний JSON, не-числовий `networth`, неправильний `month`,
 *     невалідний `categoryId`, `serializeStringArrayFromLs` no-array
 *     fallback;
 *   - LWW guard: epoch-zero `STALE_TIMESTAMP` не перетирає newer-row;
 *   - `__testing.STALE_TIMESTAMP` / `__testing.ALL_KEYS` export-перевірки.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testing, importFinykResidualFromLs } from "./residualImport";
import {
  createTestSqlite,
  type TestSqliteHandle,
} from "./dualWrite/__tests__/testSqlite";
import { applyFinykDualWriteOps } from "./dualWrite/adapter";

const USER_ID = "user-residual-test";

let handle: TestSqliteHandle;

beforeEach(async () => {
  handle = await createTestSqlite();
  localStorage.clear();
});

afterEach(() => {
  handle.close();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.doUnmock("./dualWrite/adapter.js");
  vi.doUnmock("./finykStorage");
  vi.resetModules();
});

const silentLogger = (): void => {};

// -----------------------------------------------------------------------
// __testing експорти — контракт із сусідніми модулями (debug + readers)
// -----------------------------------------------------------------------

describe("__testing експорт-контракт", () => {
  it("STALE_TIMESTAMP — epoch zero у ISO 8601", () => {
    expect(__testing.STALE_TIMESTAMP).toBe("1970-01-01T00:00:00.000Z");
  });

  it("ALL_KEYS містить усі 17 ключів LS (14 dual-write + show_balance + два prefs slice)", () => {
    expect(__testing.ALL_KEYS).toHaveLength(17);
    expect(__testing.ALL_KEYS).toEqual(
      expect.arrayContaining([
        "finyk_hidden",
        "finyk_hidden_txs",
        "finyk_budgets",
        "finyk_subs",
        "finyk_assets",
        "finyk_debts",
        "finyk_recv",
        "finyk_custom_cats_v1",
        "finyk_manual_expenses_v1",
        "finyk_tx_cats",
        "finyk_tx_splits",
        "finyk_mono_debt_linked",
        "finyk_networth_history",
        "finyk_monthly_plan",
        "finyk_show_balance_v1",
        "finyk_excluded_stat_txs",
        "finyk_rec_dismissed",
      ]),
    );
  });
});

// -----------------------------------------------------------------------
// importFinykResidualFromLs — early-return path
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — ранній no-op", () => {
  it("повертає {imported:false, cleaned:false}, коли жодного LS ключа немає", async () => {
    const result = await importFinykResidualFromLs(handle.client, USER_ID);

    expect(result).toEqual({ imported: false, cleaned: false });

    // Жоден SQLite-запис не з'явився.
    const accs = await handle.client.all<{ account_id: string }>(
      "SELECT account_id FROM finyk_hidden_accounts WHERE user_id = ?",
      [USER_ID],
    );
    expect(accs).toEqual([]);
    const prefs = await handle.client.all<{ user_id: string }>(
      "SELECT user_id FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(prefs).toEqual([]);
  });

  it("повторний виклик після успішного імпорту — no-op (LS уже вичищено)", async () => {
    localStorage.setItem("finyk_hidden", JSON.stringify(["acc-1"]));
    const first = await importFinykResidualFromLs(handle.client, USER_ID);
    expect(first.cleaned).toBe(true);

    const second = await importFinykResidualFromLs(handle.client, USER_ID);
    expect(second).toEqual({ imported: false, cleaned: false });
  });
});

// -----------------------------------------------------------------------
// happy paths — кожна категорія LS ключів → відповідна SQLite-таблиця
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — happy paths per slot", () => {
  it("hidden_accounts / hidden_transactions: id-upsert у тонстоун-таблицях", async () => {
    localStorage.setItem("finyk_hidden", JSON.stringify(["acc-1", "acc-2"]));
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["tx-9"]));

    const result = await importFinykResidualFromLs(handle.client, USER_ID);

    expect(result).toEqual({ imported: true, cleaned: true });
    expect(localStorage.getItem("finyk_hidden")).toBeNull();
    expect(localStorage.getItem("finyk_hidden_txs")).toBeNull();

    const accs = await handle.client.all<{ account_id: string }>(
      "SELECT account_id FROM finyk_hidden_accounts WHERE user_id = ? ORDER BY account_id",
      [USER_ID],
    );
    expect(accs.map((r) => r.account_id)).toEqual(["acc-1", "acc-2"]);

    const txs = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_hidden_transactions WHERE user_id = ?",
      [USER_ID],
    );
    expect(txs.map((r) => r.transaction_id)).toEqual(["tx-9"]);
  });

  it.each([
    ["finyk_budgets", "finyk_budgets"],
    ["finyk_subs", "finyk_subscriptions"],
    ["finyk_assets", "finyk_assets"],
    ["finyk_debts", "finyk_debts"],
    ["finyk_recv", "finyk_receivables"],
    ["finyk_custom_cats_v1", "finyk_custom_categories"],
    ["finyk_manual_expenses_v1", "finyk_manual_expenses"],
  ])(
    "blob-таблиця %s → %s: data_json — точна серіалізація рядка LS",
    async (lsKey, sqliteTable) => {
      const row = { id: "row-1", amount: 100, label: "ok" };
      localStorage.setItem(lsKey, JSON.stringify([row]));

      const result = await importFinykResidualFromLs(handle.client, USER_ID);

      expect(result).toEqual({ imported: true, cleaned: true });
      expect(localStorage.getItem(lsKey)).toBeNull();

      const rows = await handle.client.all<{ id: string; data_json: string }>(
        `SELECT id, data_json FROM ${sqliteTable} WHERE user_id = ?`,
        [USER_ID],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("row-1");
      expect(JSON.parse(rows[0]?.data_json ?? "{}")).toEqual(row);
    },
  );

  it("tx_cats (map id→categoryId) → finyk_tx_categories", async () => {
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({ "tx-1": "cat-A", "tx-2": "cat-B" }),
    );

    const result = await importFinykResidualFromLs(handle.client, USER_ID);

    expect(result).toEqual({ imported: true, cleaned: true });
    const rows = await handle.client.all<{
      transaction_id: string;
      category_id: string;
    }>(
      "SELECT transaction_id, category_id FROM finyk_tx_categories WHERE user_id = ? ORDER BY transaction_id",
      [USER_ID],
    );
    expect(rows).toEqual([
      { transaction_id: "tx-1", category_id: "cat-A" },
      { transaction_id: "tx-2", category_id: "cat-B" },
    ]);
  });

  it("tx_splits (map id→splits[]) → finyk_tx_splits з verbatim splits_json", async () => {
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-1": [
          { catId: "x", amount: 10 },
          { catId: "y", amount: 5 },
        ],
      }),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      transaction_id: string;
      splits_json: string;
    }>(
      "SELECT transaction_id, splits_json FROM finyk_tx_splits WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.transaction_id).toBe("tx-1");
    expect(JSON.parse(rows[0]?.splits_json ?? "[]")).toEqual([
      { catId: "x", amount: 10 },
      { catId: "y", amount: 5 },
    ]);
  });

  it("mono_debt_linked (map id→string[]) → finyk_mono_debt_links", async () => {
    localStorage.setItem(
      "finyk_mono_debt_linked",
      JSON.stringify({ "tx-1": ["debt-A", "debt-B"] }),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      transaction_id: string;
      debt_ids_json: string;
    }>(
      "SELECT transaction_id, debt_ids_json FROM finyk_mono_debt_links WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.debt_ids_json ?? "[]")).toEqual([
      "debt-A",
      "debt-B",
    ]);
  });

  it("networth_history (array of {month, networth}) → finyk_networth_history", async () => {
    localStorage.setItem(
      "finyk_networth_history",
      JSON.stringify([
        { month: "2026-04", networth: 1000 },
        { month: "2026-05", networth: 1234.5 },
      ]),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ month: string; networth: number }>(
      "SELECT month, networth FROM finyk_networth_history WHERE user_id = ? ORDER BY month",
      [USER_ID],
    );
    expect(rows).toEqual([
      { month: "2026-04", networth: 1000 },
      { month: "2026-05", networth: 1234.5 },
    ]);
  });

  it("prefs: monthly_plan + show_balance=0 + stage-13 arrays", async () => {
    localStorage.setItem(
      "finyk_monthly_plan",
      JSON.stringify({ reminderHour: 9, days: { "2026-05-15": {} } }),
    );
    localStorage.setItem("finyk_show_balance_v1", "0");
    localStorage.setItem(
      "finyk_excluded_stat_txs",
      JSON.stringify(["tx-x", "tx-y"]),
    );
    localStorage.setItem("finyk_rec_dismissed", JSON.stringify(["rec-z"]));

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      monthly_plan_json: string;
      show_balance: number;
      excluded_stat_tx_ids_json: string;
      dismissed_recurring_json: string;
    }>(
      "SELECT monthly_plan_json, show_balance, excluded_stat_tx_ids_json, dismissed_recurring_json FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.monthly_plan_json ?? "{}")).toEqual({
      reminderHour: 9,
      days: { "2026-05-15": {} },
    });
    expect(rows[0]?.show_balance).toBe(0);
    expect(JSON.parse(rows[0]?.excluded_stat_tx_ids_json ?? "[]")).toEqual([
      "tx-x",
      "tx-y",
    ]);
    expect(JSON.parse(rows[0]?.dismissed_recurring_json ?? "[]")).toEqual([
      "rec-z",
    ]);
  });

  it("show_balance=true за замовчуванням (відсутній сирий ключ → '1')", async () => {
    // Розставимо хоч один інший LS ключ, щоб hasAny=true.
    localStorage.setItem("finyk_hidden", JSON.stringify([]));

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ show_balance: number }>(
      "SELECT show_balance FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows[0]?.show_balance).toBe(1);
  });

  it('show_balance=true коли LS_SHOW_BALANCE="1" (явно)', async () => {
    localStorage.setItem("finyk_show_balance_v1", "1");

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ show_balance: number }>(
      "SELECT show_balance FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows[0]?.show_balance).toBe(1);
  });

  it('show_balance=true коли LS_SHOW_BALANCE — будь-який рядок не "0"', async () => {
    localStorage.setItem("finyk_show_balance_v1", "true");

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ show_balance: number }>(
      "SELECT show_balance FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows[0]?.show_balance).toBe(1);
  });

  it("monthly_plan_json дефолтиться на '{}' при відсутньому/null значенні", async () => {
    // hasAny=true: тримаємо хоч один LS ключ.
    localStorage.setItem("finyk_hidden", JSON.stringify([]));

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ monthly_plan_json: string }>(
      "SELECT monthly_plan_json FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(JSON.parse(rows[0]?.monthly_plan_json ?? "{}")).toEqual({});
  });

  it("чистить ВСІ LS_* ключі (як ті, що були заповнені, так і відсутні)", async () => {
    // Тільки декілька ключів заповнені, але all-keys cleanup має знести й їх.
    localStorage.setItem("finyk_hidden", JSON.stringify(["acc-1"]));
    localStorage.setItem("finyk_budgets", JSON.stringify([{ id: "b" }]));
    localStorage.setItem("finyk_show_balance_v1", "0");

    await importFinykResidualFromLs(handle.client, USER_ID);

    for (const key of __testing.ALL_KEYS) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });
});

// -----------------------------------------------------------------------
// LWW guard — STALE_TIMESTAMP не перетирає новіші SQLite-рядки
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — LWW guard (STALE_TIMESTAMP)", () => {
  const LATER = "2026-05-13T12:00:00.000Z";

  it("не перезаписує існуючий newer hidden_accounts рядок", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "id-upsert",
          table: "finyk_hidden_accounts",
          entry: { id: "acc-1" },
        },
      ],
      { userId: USER_ID, clientTs: LATER, logger: silentLogger },
    );

    localStorage.setItem("finyk_hidden", JSON.stringify(["acc-1"]));

    const result = await importFinykResidualFromLs(handle.client, USER_ID);
    expect(result.cleaned).toBe(true);

    const rows = await handle.client.all<{ updated_at: string }>(
      "SELECT updated_at FROM finyk_hidden_accounts WHERE user_id = ? AND account_id = ?",
      [USER_ID, "acc-1"],
    );
    expect(rows[0]?.updated_at).toBe(LATER);
  });

  it("не перезаписує existing blob (finyk_budgets) з новішим updated_at", async () => {
    await applyFinykDualWriteOps(
      handle.client,
      [
        {
          kind: "blob-upsert",
          table: "finyk_budgets",
          entry: { id: "b-1", dataJson: '{"id":"b-1","amount":999}' },
        },
      ],
      { userId: USER_ID, clientTs: LATER, logger: silentLogger },
    );

    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([{ id: "b-1", amount: 1 }]),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      data_json: string;
      updated_at: string;
    }>("SELECT data_json, updated_at FROM finyk_budgets WHERE id = ?", ["b-1"]);
    expect(rows[0]?.updated_at).toBe(LATER);
    expect(JSON.parse(rows[0]?.data_json ?? "{}").amount).toBe(999);
  });
});

// -----------------------------------------------------------------------
// захисні гілки в LS-читачах — невалідні форми не падають і не пишуть
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — невалідні форми (defensive parsers)", () => {
  it("readIdsFromLs: не-масив → []", async () => {
    localStorage.setItem("finyk_hidden", JSON.stringify({ wrong: "shape" }));

    const result = await importFinykResidualFromLs(handle.client, USER_ID);
    expect(result.cleaned).toBe(true);

    const accs = await handle.client.all<{ account_id: string }>(
      "SELECT account_id FROM finyk_hidden_accounts WHERE user_id = ?",
      [USER_ID],
    );
    expect(accs).toEqual([]);
  });

  it("readIdsFromLs: масив із non-string/empty/object-елементами — дропає невалідні", async () => {
    localStorage.setItem(
      "finyk_hidden",
      JSON.stringify([null, "", { x: 1 }, 42, "id-ok"]),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const accs = await handle.client.all<{ account_id: string }>(
      "SELECT account_id FROM finyk_hidden_accounts WHERE user_id = ?",
      [USER_ID],
    );
    expect(accs.map((r) => r.account_id)).toEqual(["id-ok"]);
  });

  it("readBlobsFromLs: не-масив → []", async () => {
    localStorage.setItem("finyk_budgets", JSON.stringify("oops"));

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_budgets WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toEqual([]);
  });

  it("readBlobsFromLs: рядки без id / із не-string id → дропаються", async () => {
    localStorage.setItem(
      "finyk_budgets",
      JSON.stringify([
        null,
        "not-object",
        { amount: 7 },
        { id: 42 },
        { id: "ok-id", amount: 5 },
      ]),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_budgets WHERE user_id = ? ORDER BY id",
      [USER_ID],
    );
    expect(rows.map((r) => r.id)).toEqual(["ok-id"]);
  });

  it("readTxCatsFromLs: array/null/non-string categoryId — дропаються", async () => {
    // 1. array shape → []
    localStorage.setItem("finyk_tx_cats", JSON.stringify(["wrong"]));
    await importFinykResidualFromLs(handle.client, USER_ID);
    expect(
      await handle.client.all(
        "SELECT 1 FROM finyk_tx_categories WHERE user_id = ?",
        [USER_ID],
      ),
    ).toEqual([]);

    // 2. правильний map, але невалідний contents
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({ "tx-1": 123, "tx-2": "", "tx-3": "cat-OK", "": "x" }),
    );
    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      transaction_id: string;
      category_id: string;
    }>(
      "SELECT transaction_id, category_id FROM finyk_tx_categories WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toEqual([{ transaction_id: "tx-3", category_id: "cat-OK" }]);
  });

  it("readTxSplitsFromLs / readMonoDebtLinksFromLs: пуста transactionId-key — дропається", async () => {
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({ "": [{ a: 1 }], "tx-ok": [{ b: 2 }] }),
    );
    localStorage.setItem(
      "finyk_mono_debt_linked",
      JSON.stringify({ "": ["debt-x"], "tx-ok": ["debt-y"] }),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const splits = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_tx_splits WHERE user_id = ?",
      [USER_ID],
    );
    expect(splits.map((r) => r.transaction_id)).toEqual(["tx-ok"]);

    const debts = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_mono_debt_links WHERE user_id = ?",
      [USER_ID],
    );
    expect(debts.map((r) => r.transaction_id)).toEqual(["tx-ok"]);
  });

  it("readTxSplitsFromLs: не-масив у значенні або пустий масив — дропаються", async () => {
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({
        "tx-1": "no",
        "tx-2": [],
        "tx-3": [{ a: 1 }],
      }),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_tx_splits WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows.map((r) => r.transaction_id)).toEqual(["tx-3"]);
  });

  it("readMonoDebtLinksFromLs: не-масив у значенні або пустий масив — дропаються", async () => {
    localStorage.setItem(
      "finyk_mono_debt_linked",
      JSON.stringify({
        "tx-1": "no",
        "tx-2": [],
        "tx-3": ["debt-x"],
      }),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_mono_debt_links WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows.map((r) => r.transaction_id)).toEqual(["tx-3"]);
  });

  it("readNetworthFromLs: рядки з невалідним month/networth — дропаються", async () => {
    localStorage.setItem(
      "finyk_networth_history",
      JSON.stringify([
        null,
        "not-object",
        { month: "20260513", networth: 1 }, // невалідний формат
        { month: "2026-05", networth: Number.POSITIVE_INFINITY }, // не finite
        { month: "2026-05", networth: "100" }, // не число
        { month: 2026, networth: 1 }, // не string
        { month: "2026-06", networth: 250 }, // OK
      ]),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      month: string;
      networth: number;
    }>("SELECT month, networth FROM finyk_networth_history WHERE user_id = ?", [
      USER_ID,
    ]);
    expect(rows).toEqual([{ month: "2026-06", networth: 250 }]);
  });

  it("readNetworthFromLs: не-масив → []", async () => {
    localStorage.setItem(
      "finyk_networth_history",
      JSON.stringify({ wrong: "shape" }),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all(
      "SELECT 1 FROM finyk_networth_history WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows).toEqual([]);
  });

  it("биті JSON (corrupt raw) — функція не падає і вичищає ключ", async () => {
    localStorage.setItem("finyk_budgets", "not-json");

    const result = await importFinykResidualFromLs(handle.client, USER_ID);
    expect(result.cleaned).toBe(true);
    expect(localStorage.getItem("finyk_budgets")).toBeNull();
  });

  it("serializeStringArrayFromLs: не-масив → '[]' у prefs", async () => {
    localStorage.setItem(
      "finyk_excluded_stat_txs",
      JSON.stringify({ wrong: "shape" }),
    );
    localStorage.setItem("finyk_rec_dismissed", JSON.stringify("not-array"));

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{
      excluded_stat_tx_ids_json: string;
      dismissed_recurring_json: string;
    }>(
      "SELECT excluded_stat_tx_ids_json, dismissed_recurring_json FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(JSON.parse(rows[0]?.excluded_stat_tx_ids_json ?? "[]")).toEqual([]);
    expect(JSON.parse(rows[0]?.dismissed_recurring_json ?? "[]")).toEqual([]);
  });

  it("serializeStringArrayFromLs: фільтрує не-рядкові та порожні елементи", async () => {
    localStorage.setItem(
      "finyk_rec_dismissed",
      JSON.stringify(["rec-a", null, 42, "", "rec-b", { id: "x" }]),
    );

    await importFinykResidualFromLs(handle.client, USER_ID);

    const rows = await handle.client.all<{ dismissed_recurring_json: string }>(
      "SELECT dismissed_recurring_json FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(JSON.parse(rows[0]?.dismissed_recurring_json ?? "[]")).toEqual([
      "rec-a",
      "rec-b",
    ]);
  });
});

// -----------------------------------------------------------------------
// apply path failures — LS залишається, лог-формат правильний
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — apply падає", () => {
  it("повертає {imported:false, cleaned:false} і ЗБЕРІГАЄ LS, якщо apply кидає Error", async () => {
    vi.resetModules();
    vi.doMock("./dualWrite/adapter.js", () => ({
      applyFinykDualWriteOps: vi.fn(async () => {
        throw new Error("boom");
      }),
    }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");

    localStorage.setItem("finyk_hidden", JSON.stringify(["acc-1"]));
    const result = await importFn(handle.client, USER_ID);

    expect(result).toEqual({ imported: false, cleaned: false });
    expect(localStorage.getItem("finyk_hidden")).toBe(
      JSON.stringify(["acc-1"]),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[finyk.residualImport] apply failed; LS keys retained",
      "boom",
    );
    warnSpy.mockRestore();
  });

  it("логує raw value (не .message) коли apply кидає non-Error", async () => {
    vi.resetModules();
    vi.doMock("./dualWrite/adapter.js", () => ({
      applyFinykDualWriteOps: vi.fn(async () => {
        throw "string-error";
      }),
    }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");

    localStorage.setItem("finyk_hidden", JSON.stringify(["acc-1"]));
    const result = await importFn(handle.client, USER_ID);

    expect(result).toEqual({ imported: false, cleaned: false });
    expect(warnSpy).toHaveBeenCalledWith(
      "[finyk.residualImport] apply failed; LS keys retained",
      "string-error",
    );
    warnSpy.mockRestore();
  });
});

// -----------------------------------------------------------------------
// JSON.stringify catch-гілки — потребують cyclic structure, неможливу
// від чистого LS-парсингу, тому емулюємо їх через mock readJSON.
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — cyclic-payload throw-гілки", () => {
  function makeCyclic(extras: Record<string, unknown> = {}): unknown {
    const cyclic: Record<string, unknown> = { id: "cyc", ...extras };
    cyclic.self = cyclic;
    return cyclic;
  }

  it("readBlobsFromLs дропає row, де JSON.stringify(row) кидає (cyclic)", async () => {
    vi.resetModules();
    vi.doMock("./finykStorage", async () => {
      const actual =
        await vi.importActual<typeof import("./finykStorage")>(
          "./finykStorage",
        );
      return {
        ...actual,
        // Тільки finyk_budgets віддаємо cyclic-rows; інші ключі → null.
        readJSON: vi.fn((key: string) =>
          key === "finyk_budgets"
            ? [makeCyclic({ amount: 1 }), { id: "ok", amount: 2 }]
            : null,
        ),
        readRaw: vi.fn((key: string, fallback?: unknown) =>
          key === "finyk_budgets" ? "[cyclic]" : (fallback ?? null),
        ),
        removeItem: vi.fn(() => true),
      };
    });
    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");

    const result = await importFn(handle.client, USER_ID);
    expect(result.cleaned).toBe(true);

    // Лишився тільки валідний row, cyclic — дропнутий.
    const rows = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_budgets WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows.map((r) => r.id)).toEqual(["ok"]);
  });

  it("readPrefsFromLs фолбекає monthlyPlanJson на '{}', коли plan — cyclic", async () => {
    vi.resetModules();
    vi.doMock("./finykStorage", async () => {
      const actual =
        await vi.importActual<typeof import("./finykStorage")>(
          "./finykStorage",
        );
      return {
        ...actual,
        readJSON: vi.fn((key: string) =>
          key === "finyk_monthly_plan" ? makeCyclic() : null,
        ),
        readRaw: vi.fn((key: string, fallback?: unknown) =>
          key === "finyk_monthly_plan" ? "[cyclic]" : (fallback ?? null),
        ),
        removeItem: vi.fn(() => true),
      };
    });
    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");

    const result = await importFn(handle.client, USER_ID);
    expect(result.cleaned).toBe(true);

    const rows = await handle.client.all<{ monthly_plan_json: string }>(
      "SELECT monthly_plan_json FROM finyk_prefs WHERE user_id = ?",
      [USER_ID],
    );
    expect(JSON.parse(rows[0]?.monthly_plan_json ?? "{}")).toEqual({});
  });

  it("readTxSplitsFromLs дропає row, де JSON.stringify(splits) кидає (cyclic array)", async () => {
    vi.resetModules();
    vi.doMock("./finykStorage", async () => {
      const actual =
        await vi.importActual<typeof import("./finykStorage")>(
          "./finykStorage",
        );
      const cyclicArr: unknown[] = [{ a: 1 }];
      (cyclicArr[0] as Record<string, unknown>).self = cyclicArr;
      return {
        ...actual,
        readJSON: vi.fn((key: string) =>
          key === "finyk_tx_splits"
            ? { "tx-cycle": cyclicArr, "tx-ok": [{ a: 2 }] }
            : null,
        ),
        readRaw: vi.fn((key: string, fallback?: unknown) =>
          key === "finyk_tx_splits" ? "[cyclic]" : (fallback ?? null),
        ),
        removeItem: vi.fn(() => true),
      };
    });
    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");

    await importFn(handle.client, USER_ID);

    const rows = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_tx_splits WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows.map((r) => r.transaction_id)).toEqual(["tx-ok"]);
  });

  it("readMonoDebtLinksFromLs дропає row, де JSON.stringify(debtIds) кидає (cyclic)", async () => {
    vi.resetModules();
    vi.doMock("./finykStorage", async () => {
      const actual =
        await vi.importActual<typeof import("./finykStorage")>(
          "./finykStorage",
        );
      const cyclicArr: unknown[] = ["debt-a"];
      cyclicArr.push(cyclicArr);
      return {
        ...actual,
        readJSON: vi.fn((key: string) =>
          key === "finyk_mono_debt_linked"
            ? { "tx-cycle": cyclicArr, "tx-ok": ["debt-x"] }
            : null,
        ),
        readRaw: vi.fn((key: string, fallback?: unknown) =>
          key === "finyk_mono_debt_linked" ? "[cyclic]" : (fallback ?? null),
        ),
        removeItem: vi.fn(() => true),
      };
    });
    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");

    await importFn(handle.client, USER_ID);

    const rows = await handle.client.all<{ transaction_id: string }>(
      "SELECT transaction_id FROM finyk_mono_debt_links WHERE user_id = ?",
      [USER_ID],
    );
    expect(rows.map((r) => r.transaction_id)).toEqual(["tx-ok"]);
  });
});

// -----------------------------------------------------------------------
// buildStateFromLs — throw усередині повертає null → no-op
// -----------------------------------------------------------------------

describe("importFinykResidualFromLs — buildStateFromLs throws", () => {
  it("повертає no-op, якщо хоча б один читач кидає (try/catch в buildStateFromLs)", async () => {
    vi.resetModules();
    // Мокаємо finykStorage так, щоб readJSON кидав, але readRaw і
    // далі повідомляв про наявність ключа — інакше `hasAny` буде false
    // і ми взагалі не зайдемо в `buildStateFromLs`.
    vi.doMock("./finykStorage", async () => {
      const actual =
        await vi.importActual<typeof import("./finykStorage")>(
          "./finykStorage",
        );
      return {
        ...actual,
        readJSON: vi.fn(() => {
          throw new Error("storage-broken");
        }),
        readRaw: vi.fn((key: string, fallback?: unknown) =>
          key === "finyk_hidden" ? "[]" : (fallback ?? null),
        ),
        removeItem: vi.fn(() => true),
      };
    });

    const { importFinykResidualFromLs: importFn } =
      await import("./residualImport");
    const result = await importFn(handle.client, USER_ID);

    // buildStateFromLs виявляє throw → повертає null → early-return.
    expect(result).toEqual({ imported: false, cleaned: false });

    const accs = await handle.client.all(
      "SELECT 1 FROM finyk_hidden_accounts WHERE user_id = ?",
      [USER_ID],
    );
    expect(accs).toEqual([]);
  });
});
