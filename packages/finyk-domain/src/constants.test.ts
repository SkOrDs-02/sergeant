import { describe, expect, it } from "vitest";
import {
  INCOME_CATEGORIES,
  mergeExpenseCategoryDefinitions,
  mergeIncomeCategoryDefinitions,
} from "./constants.js";

describe("unified category catalogs", () => {
  const custom = [
    { id: "expense-own", label: "Витрата" },
    { id: "income-own", label: "Дохід", kind: "income" as const },
  ];

  it("keeps custom expense and income categories in separate catalogs", () => {
    expect(mergeExpenseCategoryDefinitions(custom).map((c) => c.id)).toContain(
      "expense-own",
    );
    expect(
      mergeExpenseCategoryDefinitions(custom).map((c) => c.id),
    ).not.toContain("income-own");
    expect(mergeIncomeCategoryDefinitions(custom).map((c) => c.id)).toContain(
      "income-own",
    );
    expect(
      mergeIncomeCategoryDefinitions(custom).map((c) => c.id),
    ).not.toContain("expense-own");
  });

  it("offers the detailed tech category to every expense source", () => {
    expect(mergeExpenseCategoryDefinitions().map((c) => c.id)).toContain(
      "tech",
    );
  });
});
import { calcDebtRemaining, type Debt } from "./domain/debtEngine.js";

describe("INCOME_CATEGORIES — «Борг»", () => {
  it("містить in_debt поруч з іншими вбудованими категоріями доходу", () => {
    const debt = INCOME_CATEGORIES.find((c) => c.id === "in_debt");
    expect(debt).toBeDefined();
    expect(debt?.label).toBe("Борг");
  });

  it("keywords порожні — без автокатегоризації за словами", () => {
    const debt = INCOME_CATEGORIES.find((c) => c.id === "in_debt");
    expect(debt?.keywords).toEqual([]);
  });
});

describe("PR-3 приймання — пасив, створений із надходження «Борг»", () => {
  it("привʼязка транзакції-джерела з роллю source не подвоює суму пасиву", () => {
    // Так само, як робить новий creation-флоу з BankTransactionDetailsSheet:
    // totalAmount = сума транзакції, і та сама сума одразу привʼязана
    // як `source` (транзакція лише пояснює походження, не додає суму).
    const sourceTxId = "income-tx-1";
    const debt: Debt = {
      id: "debt-1",
      amount: 5000,
      totalAmount: 5000,
      linkedTxIds: [sourceTxId],
      txLinks: { [sourceTxId]: { role: "source", amount: 5000 } },
    };
    expect(calcDebtRemaining(debt, [])).toBe(5000);
  });
});
