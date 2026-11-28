/**
 * Рядки — з реальної виписки Monobank власника 2026-11-26 (спека
 * `docs/work/specs/finyk-investment-suggestions.md`).
 */
import { describe, expect, it } from "vitest";

import { investmentSignalOf } from "./investmentSignals.js";

describe("investmentSignalOf", () => {
  it.each([
    ["Купівля облігацій", 4829, -203_884, "ovdp"],
    ["Дія | Військові облігації", 6211, -100_000, "ovdp"],
    ["Відкриття депозиту", 4829, -22_923_100, "deposit"],
  ] as const)("внесок: %s", (description, mcc, amount, kind) => {
    expect(investmentSignalOf({ description, mcc, amount })).toEqual({
      direction: "contribution",
      kind,
    });
  });

  it("дохід: «Процент від облігацій» на надходженні", () => {
    expect(
      investmentSignalOf({
        description: "Процент від облігацій",
        mcc: 4829,
        amount: 3_180,
      }),
    ).toEqual({ direction: "income", kind: "ovdp" });
  });

  it.each([
    ["Повне погашення", 4829, -500_000],
    ["Повне погашення Click - monomarket", 4829, -120_000],
    ["Погашення наступного платежу", 4829, -80_000],
    ["Списання відсотків за вересень", 6012, -4_500],
    ["Скасування. Купівля облігацій", 4829, 203_884],
    ["Купівля облігацій", 4829, 203_884],
    ["Процент від облігацій", 4829, -3_180],
    ['ТОВ "Інжур Кепітал"', 4829, -9_936_500],
    ["Поповнення «Для інвестування»", 4829, -207_600],
    ["Відкриття депозиту", 4829, 0],
  ] as const)("не сигнал: %s (%i, %i)", (description, mcc, amount) => {
    expect(investmentSignalOf({ description, mcc, amount })).toBeNull();
  });

  it("MCC 6211 на надходженні не робить його доходом", () => {
    expect(
      investmentSignalOf({ description: "Дія", mcc: 6211, amount: 100_000 }),
    ).toBeNull();
  });
});
