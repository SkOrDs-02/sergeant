/**
 * Last validated: 2026-09-12
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { decideManualDebtLink } from "./manualDebtLink";

describe("decideManualDebtLink", () => {
  it("витрата з категорією Борг → роль «погашення»", () => {
    expect(decideManualDebtLink({ category: "debt" }, null)).toEqual({
      txRole: "payment",
      splitAmountUAH: null,
    });
  });

  it("надходження з категорією Борг → роль «поява боргу»", () => {
    expect(
      decideManualDebtLink({ category: "debt-income", kind: "income" }, null),
    ).toEqual({ txRole: "source", splitAmountUAH: null });
  });

  it("легасі-підпис категорії (ера 1/2) теж резолвиться", () => {
    // Історичні записи не мігрують пакетно — їх нормалізує читання.
    // Без цього місток не зʼявлявся б саме на старих записах.
    expect(
      decideManualDebtLink({ category: "Борги та кредити" }, null)?.txRole,
    ).toBe("payment");
    expect(
      decideManualDebtLink({ category: "💳 борги та кредити" }, null)?.txRole,
    ).toBe("payment");
  });

  it("неборгова категорія → містка немає", () => {
    expect(decideManualDebtLink({ category: "food" }, null)).toBeNull();
    expect(
      decideManualDebtLink({ category: "salary", kind: "income" }, null),
    ).toBeNull();
  });

  it("категорія «борг» у витраті не робить надходження джерелом", () => {
    // `debt` — слаг витратної таксономії; у надходженні він невідомий і
    // нормалізується в дефолт, тож містка бути не має.
    expect(
      decideManualDebtLink({ category: "debt", kind: "income" }, null),
    ).toBeNull();
  });

  it("розділений запис: береться саме боргова частка", () => {
    expect(
      decideManualDebtLink({ category: "debt" }, [
        { categoryId: "debt", amount: 150 },
        { categoryId: "food", amount: 850 },
      ]),
    ).toEqual({ txRole: "payment", splitAmountUAH: 150 });
  });

  it("розділений запис без боргової частки → містка немає", () => {
    // Рівно `0` — не «взяти повну суму»: привʼязка на 0 ₴ була б мовчазним
    // хибним числом, тим самим класом бага, що й завищення погашення.
    expect(
      decideManualDebtLink({ category: "debt" }, [
        { categoryId: "food", amount: 1000 },
      ]),
    ).toBeNull();
  });

  it("незбереженого запису немає чого привʼязувати", () => {
    expect(decideManualDebtLink(null, null)).toBeNull();
    expect(decideManualDebtLink(undefined, null)).toBeNull();
  });
});
