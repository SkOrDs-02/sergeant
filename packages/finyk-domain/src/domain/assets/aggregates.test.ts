import { describe, expect, it } from "vitest";

import {
  computeAssetsSummary,
  filterVisibleAccounts,
  getAccountCurrencySymbol,
  getManualAssetCurrencySymbol,
  sumDebtsRemaining,
  sumJarsUAH,
  sumManualAssetsUAH,
  sumReceivablesRemaining,
} from "./aggregates.js";
import type {
  AssetsDebt,
  AssetsReceivable,
  ManualAsset,
  MonoAccount,
  MonoJarLike,
} from "./types.js";

const asTx = <T extends object>(tx: T): never => tx as never;

describe("assets — sumManualAssetsUAH", () => {
  it("повертає 0 для порожнього/відсутнього списку", () => {
    expect(sumManualAssetsUAH([])).toBe(0);
    expect(sumManualAssetsUAH(undefined)).toBe(0);
    expect(sumManualAssetsUAH(null)).toBe(0);
  });

  it("ігнорує не-UAH валюти", () => {
    const assets: ManualAsset[] = [
      { id: "a", name: "cash", amount: 1000, currency: "UAH" },
      { id: "b", name: "brokerage", amount: 500, currency: "USD" },
      { id: "c", name: "eu cash", amount: 200, currency: "EUR" },
    ];
    expect(sumManualAssetsUAH(assets)).toBe(1000);
  });

  it("сумує кілька UAH записів", () => {
    const assets: ManualAsset[] = [
      { id: "a", name: "cash", amount: 250, currency: "UAH" },
      { id: "b", name: "safe", amount: 750.5, currency: "UAH" },
    ];
    expect(sumManualAssetsUAH(assets)).toBe(1000.5);
  });

  it("толерує string-сумісну `amount`", () => {
    const assets = [
      { id: "a", name: "cash", amount: "500", currency: "UAH" },
      { id: "b", name: "empty", amount: "", currency: "UAH" },
    ] as unknown as ManualAsset[];
    expect(sumManualAssetsUAH(assets)).toBe(500);
  });
});

describe("assets — sumDebtsRemaining", () => {
  it("повертає 0 коли боргів немає", () => {
    expect(sumDebtsRemaining([])).toBe(0);
    expect(sumDebtsRemaining(undefined)).toBe(0);
  });

  it("сумує залишки кількох боргів", () => {
    const debts: AssetsDebt[] = [
      { id: "d1", amount: 100, totalAmount: 1000, linkedTxIds: [] },
      { id: "d2", amount: 50, totalAmount: 400, linkedTxIds: [] },
    ];
    expect(sumDebtsRemaining(debts, [])).toBe(1400);
  });

  it("враховує лінковані платежі (amount < 0) як сплати", () => {
    const debts: AssetsDebt[] = [
      { id: "d1", amount: 0, totalAmount: 500, linkedTxIds: ["p"] },
    ];
    const tx = [asTx({ id: "p", amount: -200_00 })];
    expect(sumDebtsRemaining(debts, tx)).toBe(300);
  });

  it("не йде нижче нуля при переплаті", () => {
    const debts: AssetsDebt[] = [
      { id: "d1", amount: 0, totalAmount: 100, linkedTxIds: ["p"] },
    ];
    const tx = [asTx({ id: "p", amount: -500_00 })];
    expect(sumDebtsRemaining(debts, tx)).toBe(0);
  });
});

describe("assets — sumReceivablesRemaining", () => {
  it("повертає 0 коли дебіторів немає", () => {
    expect(sumReceivablesRemaining([])).toBe(0);
    expect(sumReceivablesRemaining(undefined)).toBe(0);
  });

  it("сумує залишки дебіторки з урахуванням погашень", () => {
    const recv: AssetsReceivable[] = [
      { id: "r1", amount: 300, linkedTxIds: [] },
      { id: "r2", amount: 200, linkedTxIds: ["p"] },
    ];
    const tx = [asTx({ id: "p", amount: 50_00 })];
    expect(sumReceivablesRemaining(recv, tx)).toBe(450);
  });
});

describe("assets — sumJarsUAH", () => {
  it("повертає 0 для порожнього/відсутнього списку", () => {
    expect(sumJarsUAH([])).toBe(0);
    expect(sumJarsUAH(undefined)).toBe(0);
    expect(sumJarsUAH(null)).toBe(0);
  });

  it("сумує UAH-банки (копійки → гривні)", () => {
    const jars: MonoJarLike[] = [
      { id: "j1", title: "Відпустка", balance: 150_00, currencyCode: 980 },
      { id: "j2", title: "Подушка", balance: 500_00, currencyCode: 980 },
    ];
    expect(sumJarsUAH(jars)).toBe(650);
  });

  it("ігнорує не-UAH банки", () => {
    const jars: MonoJarLike[] = [
      { id: "j1", balance: 100_00, currencyCode: 980 },
      { id: "j2", balance: 999_00, currencyCode: 840 },
    ];
    expect(sumJarsUAH(jars)).toBe(100);
  });

  it("трактує відсутній/null balance як 0, не як помилку", () => {
    const jars: MonoJarLike[] = [
      { id: "j1", balance: null, currencyCode: 980 },
      { id: "j2", currencyCode: 980 },
    ];
    expect(sumJarsUAH(jars)).toBe(0);
  });
});

describe("assets — filterVisibleAccounts", () => {
  it("відсікає сховані рахунки по id", () => {
    const accounts: MonoAccount[] = [
      { id: "a", balance: 0 },
      { id: "b", balance: 0 },
      { id: "c", balance: 0 },
    ];
    expect(filterVisibleAccounts(accounts, ["b"]).map((a) => a.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("зберігає рахунки без id навіть у hidden-списку", () => {
    const accounts: MonoAccount[] = [
      { balance: 100 },
      { id: "b", balance: 200 },
    ];
    const visible = filterVisibleAccounts(accounts, ["b"]);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.balance).toBe(100);
  });
});

describe("assets — currency symbols", () => {
  it("getAccountCurrencySymbol мапить канонічні коди", () => {
    expect(getAccountCurrencySymbol(980)).toBe("₴");
    expect(getAccountCurrencySymbol(840)).toBe("$");
    expect(getAccountCurrencySymbol(978)).toBe("€");
  });

  it("getAccountCurrencySymbol фолбечить на ₴ при невідомому/відсутньому коді", () => {
    expect(getAccountCurrencySymbol(123)).toBe("₴");
    expect(getAccountCurrencySymbol(undefined)).toBe("₴");
    expect(getAccountCurrencySymbol(null)).toBe("₴");
  });

  it("getManualAssetCurrencySymbol мапить alpha-коди", () => {
    expect(getManualAssetCurrencySymbol("UAH")).toBe("₴");
    expect(getManualAssetCurrencySymbol("USD")).toBe("$");
    expect(getManualAssetCurrencySymbol("EUR")).toBe("€");
    expect(getManualAssetCurrencySymbol("PLN")).toBe("PLN");
  });
});

describe("assets — computeAssetsSummary", () => {
  it("порожній стейт → всі нулі", () => {
    const summary = computeAssetsSummary({
      accounts: [],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary).toEqual({
      monoBalance: 0,
      monoDebt: 0,
      manualAssetTotal: 0,
      jarsTotal: 0,
      manualDebtTotal: 0,
      receivableTotal: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      networth: 0,
    });
  });

  it("networth = totalAssets − totalLiabilities", () => {
    const accounts: MonoAccount[] = [
      // +500 ₴ UAH asset (balance у копійках, UAH=980)
      { id: "a1", balance: 500_00, currencyCode: 980 },
      // Кредитка: creditLimit=1000_00, balance=300_00 → борг = 700₴
      {
        id: "a2",
        balance: 300_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const manualAssets: ManualAsset[] = [
      { id: "m1", name: "готівка", amount: 200, currency: "UAH" },
      { id: "m2", name: "FX", amount: 999, currency: "USD" },
    ];
    const manualDebts: AssetsDebt[] = [
      { id: "d1", amount: 0, totalAmount: 100, linkedTxIds: [] },
    ];
    const receivables: AssetsReceivable[] = [
      { id: "r1", amount: 50, linkedTxIds: [] },
    ];

    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: [],
      manualAssets,
      manualDebts,
      receivables,
      transactions: [],
    });

    expect(summary.monoBalance).toBe(500);
    expect(summary.monoDebt).toBe(700);
    expect(summary.manualAssetTotal).toBe(200);
    expect(summary.manualDebtTotal).toBe(100);
    expect(summary.receivableTotal).toBe(50);
    expect(summary.totalAssets).toBe(500 + 200 + 50);
    expect(summary.totalLiabilities).toBe(700 + 100);
    expect(summary.networth).toBe(
      summary.totalAssets - summary.totalLiabilities,
    );
  });

  it("виключає сховані рахунки з mono-активів", () => {
    const accounts: MonoAccount[] = [
      { id: "visible", balance: 400_00, currencyCode: 980 },
      { id: "hidden", balance: 900_00, currencyCode: 980 },
    ];
    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: ["hidden"],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary.monoBalance).toBe(400);
    expect(summary.totalAssets).toBe(400);
  });

  it("виключає сховану кредитку і з debt, не лише з balance (regression)", () => {
    // Раніше `getMonoTotals` фільтрував `visible` для balance, але debt
    // рахував по всіх accounts → сховану кредитку виводило з UI, а її
    // борг усе одно тягнувся у networth. Тут — кредитка з боргом 700₴,
    // прихована → totalLiabilities має бути 0.
    const accounts: MonoAccount[] = [
      { id: "cash", balance: 500_00, currencyCode: 980 },
      {
        id: "hidden-credit",
        balance: 300_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: ["hidden-credit"],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary.monoBalance).toBe(500);
    expect(summary.monoDebt).toBe(0);
    expect(summary.totalLiabilities).toBe(0);
    expect(summary.networth).toBe(500);
  });

  it("дебетова картка у мінусі рахується як debt (regression)", () => {
    // Раніше `isMonoDebt` повертав false для `creditLimit=0`, тож
    // овердрафтна дебетка (balance<0) мовчки не йшла у networth.
    const accounts: MonoAccount[] = [
      { id: "cash", balance: 300_00, currencyCode: 980 },
      { id: "overdraft", balance: -150_00, currencyCode: 980 },
    ];
    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: [],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary.monoBalance).toBe(300);
    expect(summary.monoDebt).toBe(150);
    expect(summary.totalLiabilities).toBe(150);
    expect(summary.networth).toBe(150);
  });

  it("рахує власні кошти кредитки (balance > creditLimit) в totalAssets", () => {
    // Кредитка з балансом ПОНАД ліміт: creditLimit=1000_00, balance=1300_00
    // → власні кошти зверху ліміту = 300₴ ідуть в capital, боргу немає.
    const accounts: MonoAccount[] = [
      {
        id: "credit-over",
        balance: 1300_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: [],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary.monoBalance).toBe(300);
    expect(summary.monoDebt).toBe(0);
    expect(summary.totalAssets).toBe(300);
    expect(summary.networth).toBe(300);
  });

  it("кредитка в мінусі відносно ліміту дає 0 у balance, борг — у Пасивах", () => {
    const accounts: MonoAccount[] = [
      {
        id: "credit-under",
        balance: 300_00,
        creditLimit: 1000_00,
        currencyCode: 980,
      },
    ];
    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: [],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary.monoBalance).toBe(0);
    expect(summary.monoDebt).toBe(700);
    expect(summary.totalAssets).toBe(0);
    expect(summary.totalLiabilities).toBe(700);
  });

  it("включає банки Monobank у totalAssets/networth", () => {
    const accounts: MonoAccount[] = [
      { id: "a1", balance: 500_00, currencyCode: 980 },
    ];
    const jars: MonoJarLike[] = [
      { id: "j1", title: "Відпустка", balance: 200_00, currencyCode: 980 },
    ];
    const summary = computeAssetsSummary({
      accounts,
      hiddenAccounts: [],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
      jars,
    });
    expect(summary.jarsTotal).toBe(200);
    expect(summary.totalAssets).toBe(500 + 200);
    expect(summary.networth).toBe(700);
  });

  it("не передані jars (mobile caller) → jarsTotal 0, назад-сумісно", () => {
    const summary = computeAssetsSummary({
      accounts: [],
      manualAssets: [],
      manualDebts: [],
      receivables: [],
      transactions: [],
    });
    expect(summary.jarsTotal).toBe(0);
  });

  it("враховує лінковані платежі при підсумку боргів", () => {
    const manualDebts: AssetsDebt[] = [
      { id: "d1", amount: 0, totalAmount: 500, linkedTxIds: ["p1"] },
    ];
    const transactions = [asTx({ id: "p1", amount: -200_00 })];
    const summary = computeAssetsSummary({
      accounts: [],
      manualAssets: [],
      manualDebts,
      receivables: [],
      transactions,
    });
    expect(summary.manualDebtTotal).toBe(300);
    expect(summary.totalLiabilities).toBe(300);
    expect(summary.networth).toBe(-300);
  });
});
