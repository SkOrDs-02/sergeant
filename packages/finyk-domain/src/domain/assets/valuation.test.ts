/**
 * Розрахунок вартості рахунків-активів на числах зі спеки
 * `docs/work/specs/finyk-savings-assets.md` § Верифікація.
 */
import { describe, expect, it } from "vitest";

import { computeAssetsSummary, sumManualAssetsUAH } from "./aggregates.js";
import type { AssetEvent, ManualAsset } from "./types.js";
import {
  DEFAULT_DEPOSIT_TAX_PCT,
  addMonthsKey,
  assetValueMinor,
  depositValueMinor,
  fundValueMinor,
  isAssetMatured,
  ovdpCouponWindow,
  ovdpUpcomingCoupons,
  ovdpValueMinor,
  valueAsset,
} from "./valuation.js";

let seq = 0;
function ev(
  type: AssetEvent["type"],
  date: string,
  amountMinor: number,
  extra: Partial<AssetEvent> = {},
): AssetEvent {
  seq += 1;
  return { id: `e${seq}`, type, date, amountMinor, ...extra };
}

function asset(partial: Partial<ManualAsset>): ManualAsset {
  return {
    id: "a1",
    name: "Актив",
    amount: 0,
    currency: "UAH",
    ...partial,
  };
}

describe("addMonthsKey", () => {
  it("тримає число, а коротший місяць бере останній день", () => {
    expect(addMonthsKey("2026-01-10", 1)).toBe("2026-02-10");
    expect(addMonthsKey("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(addMonthsKey("2026-01-31", 2, 31)).toBe("2026-03-31");
    expect(addMonthsKey("2027-01-01", -6)).toBe("2026-07-01");
  });
});

describe("депозит за ставкою", () => {
  const deposit = asset({
    kind: "deposit",
    deposit: {
      ratePct: 15,
      startDate: "2026-01-10",
      capitalization: "monthly",
      taxPct: DEFAULT_DEPOSIT_TAX_PCT,
    },
    events: [ev("contribution", "2026-01-10", 10_000_000)],
  });

  it("дефолтний податок 23%", () => {
    expect(DEFAULT_DEPOSIT_TAX_PCT).toBe(23);
  });

  it("щомісячна капіталізація: 980,96 грн за перший місяць", () => {
    // 100 000 × 0,15 × 31/365 × 0,77 = 980,9589
    expect(depositValueMinor(deposit, "2026-02-10")).toBe(10_098_096);
  });

  it("через 10 днів після капіталізації: 101 300,50 грн", () => {
    // 100 980,96 + 100 980,96 × 0,15 × 10/365 × 0,77
    expect(depositValueMinor(deposit, "2026-02-20")).toBe(10_130_050);
  });

  it("до першої дати капіталізації вартість росте щодня", () => {
    const d1 = depositValueMinor(deposit, "2026-01-20");
    const d2 = depositValueMinor(deposit, "2026-01-21");
    expect(d1).toBeGreaterThan(10_000_000);
    expect(d2).toBeGreaterThan(d1);
  });

  it("payout: вартість = тіло", () => {
    const payout = asset({
      ...deposit,
      deposit: { ...deposit.deposit!, capitalization: "payout" },
    });
    expect(depositValueMinor(payout, "2026-06-01")).toBe(10_000_000);
  });

  it("внесок і часткове повернення змінюють тіло з дати події", () => {
    const moved = asset({
      ...deposit,
      deposit: { ...deposit.deposit!, capitalization: "payout" },
      events: [
        ev("contribution", "2026-01-10", 10_000_000),
        ev("contribution", "2026-02-01", 5_000_000),
        ev("withdrawal", "2026-03-01", 2_000_000),
      ],
    });
    expect(depositValueMinor(moved, "2026-01-31")).toBe(10_000_000);
    expect(depositValueMinor(moved, "2026-02-01")).toBe(15_000_000);
    expect(depositValueMinor(moved, "2026-03-01")).toBe(13_000_000);
  });

  it("після кінця строку нарахування зупиняється, залишок капіталізовано", () => {
    const term = asset({
      ...deposit,
      deposit: {
        ...deposit.deposit!,
        capitalization: "end",
        endDate: "2026-04-10",
      },
    });
    const atEnd = depositValueMinor(term, "2026-04-10");
    // 100 000 × 0,15 × 90/365 × 0,77 = 2 847,95
    expect(atEnd).toBe(10_284_795);
    expect(depositValueMinor(term, "2026-06-01")).toBe(atEnd);
    expect(isAssetMatured(term, "2026-04-10")).toBe(true);
    expect(isAssetMatured(term, "2026-04-09")).toBe(false);
  });

  it("оцінка зі звіту банку перебиває розрахунок", () => {
    const valued = asset({
      ...deposit,
      events: [
        ...(deposit.events ?? []),
        ev("valuation", "2026-02-15", 10_150_000),
      ],
    });
    expect(depositValueMinor(valued, "2026-02-15")).toBe(10_150_000);
  });
});

describe("ОВДП за амортизованою вартістю", () => {
  const ovdp = asset({
    kind: "ovdp",
    ovdp: {
      nominalMinor: 100_000,
      couponRatePct: 16,
      couponsPerYear: 2,
      maturityDate: "2027-01-01",
      taxPct: 0,
    },
    events: [ev("contribution", "2026-01-01", 970_000, { count: 10 })],
  });

  it("купонні дати від погашення кроком у пів року", () => {
    expect(ovdpCouponWindow(ovdp.ovdp!, "2026-07-02")).toEqual({
      last: "2026-07-01",
      next: "2027-01-01",
    });
    expect(ovdpUpcomingCoupons(ovdp.ovdp!, "2026-03-01")).toEqual([
      "2026-07-01",
      "2027-01-01",
    ]);
  });

  it("2026-07-02: 9 849,59 амортизації + 4,35 купона = 9 853,94 грн", () => {
    expect(ovdpValueMinor(ovdp, "2026-07-02")).toBe(985_394);
  });

  it("у день погашення і після — номінал", () => {
    expect(ovdpValueMinor(ovdp, "2027-01-01")).toBe(1_000_000);
    expect(ovdpValueMinor(ovdp, "2027-03-01")).toBe(1_000_000);
  });

  it("продаж частини облігацій зменшує лот пропорційно", () => {
    const sold = asset({
      ...ovdp,
      events: [
        ...(ovdp.events ?? []),
        ev("withdrawal", "2026-01-01", 485_000, { count: 5 }),
      ],
    });
    // Лишилось 5 шт. за 4 850 грн: та сама амортизація навпіл.
    expect(ovdpValueMinor(sold, "2027-01-01")).toBe(500_000);
  });
});

describe("фонд «вклав / коштує»", () => {
  const fund = asset({
    kind: "fund",
    events: [
      ev("contribution", "2026-01-05", 1_000_000),
      ev("contribution", "2026-02-05", 500_000),
    ],
  });

  it("без оцінки вартість = вкладено", () => {
    expect(fundValueMinor(fund, "2026-03-01")).toBe(1_500_000);
  });

  it("оцінка 16 200 → результат +1 200 (8%)", () => {
    const valued = asset({
      ...fund,
      events: [
        ...(fund.events ?? []),
        ev("valuation", "2026-03-01", 1_620_000),
      ],
    });
    const v = valueAsset(valued, "2026-03-02");
    expect(v.valueMinor).toBe(1_620_000);
    expect(v.investedMinor).toBe(1_500_000);
    expect(v.resultMinor).toBe(120_000);
    expect(v.resultPct).toBeCloseTo(8, 10);
  });

  it("внесок після оцінки додається до неї", () => {
    const valued = asset({
      ...fund,
      events: [
        ...(fund.events ?? []),
        ev("valuation", "2026-03-01", 1_620_000),
        ev("contribution", "2026-03-10", 100_000),
      ],
    });
    expect(fundValueMinor(valued, "2026-03-10")).toBe(1_720_000);
  });
});

describe("курс і капітал", () => {
  it("USD-актив 1 000 $ за курсом 41,50 дає 41 500 грн; без курсу — виключений", () => {
    const usd = asset({ currency: "USD", amount: 1000 });
    expect(sumManualAssetsUAH([usd], "2026-03-01")).toBe(0);
    const withRate = asset({
      ...usd,
      fxRate: { uahPerUnit: 41.5, asOf: "2026-03-01" },
    });
    expect(sumManualAssetsUAH([withRate], "2026-03-01")).toBe(41_500);
  });

  it("старий актив без типу рахується як до зміни", () => {
    const legacy = [
      asset({ id: "x", amount: 1234.56 }),
      asset({ id: "y", amount: 100, currency: "EUR" }),
    ];
    expect(sumManualAssetsUAH(legacy, "2026-03-01")).toBe(1234.56);
    expect(assetValueMinor(legacy[0]!, "2026-03-01")).toBe(123_456);
  });

  it("закритий актив не входить у капітал", () => {
    const closed = asset({ amount: 5000, status: "closed" });
    const summary = computeAssetsSummary({
      accounts: [],
      manualAssets: [closed, asset({ id: "b", amount: 100 })],
      manualDebts: [],
      receivables: [],
      transactions: [],
      today: "2026-03-01",
    });
    expect(summary.manualAssetTotal).toBe(100);
  });
});
