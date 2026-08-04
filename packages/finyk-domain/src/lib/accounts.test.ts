import { describe, expect, it } from "vitest";
import {
  getMonoDebt,
  getMonoOwnFunds,
  getMonoTotals,
  isMonoDebt,
  type MonoAccount,
} from "./accounts.js";

describe("accounts — getMonoOwnFunds", () => {
  it("для звичайної картки (без ліміту) дорівнює balance", () => {
    expect(getMonoOwnFunds({ balance: 500_00 })).toBe(500_00);
    expect(getMonoOwnFunds({ balance: -150_00 })).toBe(-150_00);
  });

  it("для кредитки в мінусі відносно ліміту → 0", () => {
    expect(getMonoOwnFunds({ balance: 300_00, creditLimit: 1000_00 })).toBe(0);
  });

  it("для кредитки з балансом понад ліміт → різниця", () => {
    expect(getMonoOwnFunds({ balance: 1300_00, creditLimit: 1000_00 })).toBe(
      300_00,
    );
  });

  it("трактує відсутній balance як 0", () => {
    expect(getMonoOwnFunds({})).toBe(0);
    expect(getMonoOwnFunds({ creditLimit: 1000_00 })).toBe(0);
  });
});

describe("accounts — getMonoTotals (credit-card own funds)", () => {
  it("додає власні кошти кредитки в balance, коли вони понад ліміт", () => {
    const accounts: MonoAccount[] = [
      {
        id: "credit",
        balance: 1300_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const totals = getMonoTotals(accounts);
    expect(totals.balance).toBe(300);
    expect(totals.debt).toBe(0);
  });

  it("не додає нічого, коли кредитка в мінусі відносно ліміту", () => {
    const accounts: MonoAccount[] = [
      {
        id: "credit",
        balance: 300_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const totals = getMonoTotals(accounts);
    expect(totals.balance).toBe(0);
    expect(totals.debt).toBe(700);
  });

  it("звичайні картки поводяться як раніше (balance > 0, UAH-only)", () => {
    const accounts: MonoAccount[] = [
      { id: "a1", balance: 500_00, currencyCode: 980 },
      { id: "a2", balance: -100_00, currencyCode: 980 },
      { id: "a3", balance: 200_00, currencyCode: 840 },
    ];
    const totals = getMonoTotals(accounts);
    // a1: +500; a2: excluded from balance (negative, counted as debt below);
    // a3: excluded — non-UAH.
    expect(totals.balance).toBe(500);
    expect(totals.debt).toBe(100);
  });

  it("змішаний портфель: звичайна картка + кредитка з власними коштами", () => {
    const accounts: MonoAccount[] = [
      { id: "cash", balance: 400_00, currencyCode: 980 },
      {
        id: "credit",
        balance: 1200_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const totals = getMonoTotals(accounts);
    expect(totals.balance).toBe(400 + 200);
    expect(totals.debt).toBe(0);
  });
});

describe("accounts — getMonoDebt / isMonoDebt (unchanged)", () => {
  it("кредитка з боргом", () => {
    const acc: MonoAccount = { balance: 300_00, creditLimit: 1000_00 };
    expect(isMonoDebt(acc)).toBe(true);
    expect(getMonoDebt(acc)).toBe(700);
  });

  it("кредитка без боргу (balance >= creditLimit)", () => {
    const acc: MonoAccount = { balance: 1300_00, creditLimit: 1000_00 };
    expect(isMonoDebt(acc)).toBe(false);
    expect(getMonoDebt(acc)).toBe(0);
  });

  it("дебетова картка в мінусі — теж борг", () => {
    const acc: MonoAccount = { balance: -50_00 };
    expect(isMonoDebt(acc)).toBe(true);
    expect(getMonoDebt(acc)).toBe(50);
  });
});
