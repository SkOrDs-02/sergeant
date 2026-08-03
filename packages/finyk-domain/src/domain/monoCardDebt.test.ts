import { describe, expect, it } from "vitest";
import {
  classifyMonoCardLink,
  isMonoCardRepayment,
  isSuggestedMonoCardRepayment,
  sumMonoCardPaid,
} from "./monoCardDebt.js";

const CARD = "card-1";

describe("isMonoCardRepayment", () => {
  it("надходження на саму картку — погашення", () => {
    expect(
      isMonoCardRepayment({ id: "a", amount: 500_00, _accountId: CARD }, CARD),
    ).toBe(true);
  });

  it("витрата по самій картці — покупка, не погашення", () => {
    expect(
      isMonoCardRepayment({ id: "a", amount: -500_00, _accountId: CARD }, CARD),
    ).toBe(false);
  });

  it("витрата з іншого рахунку — погашення", () => {
    expect(
      isMonoCardRepayment(
        { id: "a", amount: -500_00, _accountId: "debit" },
        CARD,
      ),
    ).toBe(true);
  });

  it("надходження на інший рахунок — НЕ погашення", () => {
    // Регресія: зарплата на дебетку картки не торкалась, але стара
    // перевірка відсіювала лише покупку по картці й зараховувала це.
    expect(
      isMonoCardRepayment(
        { id: "a", amount: 30_000_00, _accountId: "debit" },
        CARD,
      ),
    ).toBe(false);
  });

  it("ручна витрата (без рахунку) — погашення", () => {
    expect(
      isMonoCardRepayment({ id: "a", amount: -200_00, _accountId: null }, CARD),
    ).toBe(true);
  });

  it("нульова сума нічого не погашає", () => {
    expect(
      isMonoCardRepayment({ id: "a", amount: 0, _accountId: CARD }, CARD),
    ).toBe(false);
  });
});

describe("sumMonoCardPaid", () => {
  const transactions = [
    { id: "topup", amount: 1_000_00, _accountId: CARD },
    { id: "purchase", amount: -400_00, _accountId: CARD },
    { id: "transfer", amount: -600_00, _accountId: "debit" },
    { id: "salary", amount: 30_000_00, _accountId: "debit" },
  ];

  it("рахує лише привʼязані погашення", () => {
    expect(sumMonoCardPaid(transactions, ["topup", "transfer"], CARD)).toBe(
      1600,
    );
  });

  it("привʼязана покупка по картці не роздуває погашене", () => {
    expect(sumMonoCardPaid(transactions, ["topup", "purchase"], CARD)).toBe(
      1000,
    );
  });

  it("привʼязане надходження на інший рахунок не рахується", () => {
    expect(sumMonoCardPaid(transactions, ["topup", "salary"], CARD)).toBe(1000);
  });

  it("непривʼязані операції ігноруються", () => {
    expect(sumMonoCardPaid(transactions, [], CARD)).toBe(0);
  });

  it("порожній набір транзакцій дає нуль, а не падіння", () => {
    expect(sumMonoCardPaid([], ["topup"], CARD)).toBe(0);
  });
});

describe("isSuggestedMonoCardRepayment", () => {
  it("підказує лише поповнення самої картки", () => {
    expect(
      isSuggestedMonoCardRepayment(
        { id: "a", amount: 500_00, _accountId: CARD },
        CARD,
      ),
    ).toBe(true);
    // Витрата з дебетки теж може бути погашенням, але радити її наосліп
    // означало б підсвічувати будь-яку покупку.
    expect(
      isSuggestedMonoCardRepayment(
        { id: "a", amount: -500_00, _accountId: "debit" },
        CARD,
      ),
    ).toBe(false);
  });
});

describe("classifyMonoCardLink", () => {
  it("розрізняє три випадки, а не два", () => {
    expect(
      classifyMonoCardLink({ id: "a", amount: 500_00, _accountId: CARD }, CARD),
    ).toBe("repayment");
    expect(
      classifyMonoCardLink(
        { id: "a", amount: -500_00, _accountId: CARD },
        CARD,
      ),
    ).toBe("card-purchase");
    expect(
      classifyMonoCardLink(
        { id: "a", amount: 30_000_00, _accountId: "debit" },
        CARD,
      ),
    ).toBe("other-income");
  });

  it("витрата з іншого рахунку — теж погашення", () => {
    expect(
      classifyMonoCardLink(
        { id: "a", amount: -600_00, _accountId: "debit" },
        CARD,
      ),
    ).toBe("repayment");
  });
});
