import { describe, expect, it } from "vitest";

import {
  buildSavingsAsset,
  emptySavingsDraft,
  isSavingsDraftValid,
  parseDecimal,
} from "./savingsAssetDraft";

let n = 0;
const opts = { today: "2026-02-20", newId: () => `id-${++n}` };

describe("savingsAssetDraft", () => {
  it("кома як роздільник і порожнє поле", () => {
    expect(parseDecimal("41,5")).toBe(41.5);
    expect(parseDecimal(" 1 000 ")).toBe(1000);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });

  it("депозит: дефолтний податок 23%, внесок і кешована вартість", () => {
    const draft = {
      ...emptySavingsDraft("deposit", "2026-01-10"),
      name: "Депозит ПУМБ",
      invested: "100000",
      ratePct: "15",
    };
    expect(draft.taxPct).toBe("23");
    const asset = buildSavingsAsset(draft, opts)!;
    expect(asset.kind).toBe("deposit");
    expect(asset.deposit).toEqual({
      ratePct: 15,
      startDate: "2026-01-10",
      endDate: null,
      capitalization: "monthly",
      taxPct: 23,
    });
    expect(asset.events).toEqual([
      expect.objectContaining({
        type: "contribution",
        date: "2026-01-10",
        amountMinor: 10_000_000,
      }),
    ]);
    // Вартість на 2026-02-20 — та сама, що в доменному тесті.
    expect(asset.amount).toBe(101_300.5);
  });

  it("ОВДП у доларах з курсом: кількість у внеску, податок 0", () => {
    const draft = {
      ...emptySavingsDraft("ovdp", "2026-01-01"),
      name: "ОВДП $",
      currency: "USD" as const,
      fxRate: "41,5",
      invested: "9700",
      count: "10",
      nominal: "1000",
      couponRatePct: "4,5",
      maturityDate: "2027-01-01",
    };
    expect(draft.taxPct).toBe("0");
    const asset = buildSavingsAsset(draft, opts)!;
    expect(asset.fxRate).toEqual({ uahPerUnit: 41.5, asOf: "2026-02-20" });
    expect(asset.ovdp).toMatchObject({
      nominalMinor: 100_000,
      couponsPerYear: 2,
      taxPct: 0,
    });
    expect(asset.events?.[0]).toMatchObject({
      count: 10,
      amountMinor: 970_000,
    });
  });

  it("фонд: поточна оцінка стає подією valuation на сьогодні", () => {
    const asset = buildSavingsAsset(
      {
        ...emptySavingsDraft("fund", "2026-01-05"),
        name: "Інжур",
        invested: "15000",
        currentValue: "16200",
      },
      opts,
    )!;
    expect(asset.events?.map((e) => [e.type, e.date, e.amountMinor])).toEqual([
      ["contribution", "2026-01-05", 1_500_000],
      ["valuation", "2026-02-20", 1_620_000],
    ]);
    expect(asset.amount).toBe(16_200);
  });

  it("невалідне не будується", () => {
    const base = {
      ...emptySavingsDraft("ovdp", "2026-01-01"),
      name: "ОВДП",
      invested: "9700",
      count: "10",
      couponRatePct: "16",
      maturityDate: "2027-01-01",
    };
    expect(isSavingsDraftValid(base)).toBe(true);
    expect(isSavingsDraftValid({ ...base, name: " " })).toBe(false);
    expect(isSavingsDraftValid({ ...base, count: "1.5" })).toBe(false);
    expect(isSavingsDraftValid({ ...base, couponsPerYear: "5" })).toBe(false);
    expect(isSavingsDraftValid({ ...base, maturityDate: "2025-12-31" })).toBe(
      false,
    );
    expect(isSavingsDraftValid({ ...base, taxPct: "120" })).toBe(false);
    expect(isSavingsDraftValid({ ...base, currency: "USD", fxRate: "0" })).toBe(
      false,
    );
    expect(buildSavingsAsset({ ...base, invested: "" }, opts)).toBeNull();
  });
});
