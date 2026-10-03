// @vitest-environment jsdom
/**
 * Тренд категорії × правила «Завжди так для цього магазину» (рішення власника
 * 2026-10-01): тренд «Транспорту» бачить витрати мерчанта, якому правило
 * призначило цю категорію, так само, як список операцій.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { buildMerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";

const mirror = vi.hoisted(() => ({ tx: [] as unknown[] }));
vi.mock("./useFinykStatTransactions", () => ({
  useFinykMirrorTransactions: () => mirror.tx,
}));

import { useMonthlyTrend } from "./useMonthlyTrend";

const RULES = buildMerchantRuleIndex([
  {
    id: "mr_1",
    kind: "expense",
    merchantKey: "сільпо",
    categoryId: "transport",
    label: "Сільпо",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  },
]);

function silpo(id: string, amount: number): Transaction {
  const time = Math.floor(
    new Date("2026-09-10T12:00:00+03:00").getTime() / 1000,
  );
  return {
    id,
    amount,
    time,
    date: "2026-09-10",
    description: "Сільпо №5",
    mcc: 0,
    categoryId: "other",
    type: "expense",
    source: "mono",
    accountId: "a",
    manual: false,
    _source: "mono",
    _accountId: "a",
    _manual: false,
  } as Transaction;
}

const base = { excludedTxIds: new Set<string>(), txSplits: {} };

describe("useMonthlyTrend × правила мерчантів", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-25T07:00:00Z"));
    mirror.tx = [silpo("s1", -12_000), silpo("s2", -8_000)];
  });
  afterEach(() => vi.useRealTimers());

  it("без правил витрати Сільпо не належать «Транспорту»", () => {
    const { result } = renderHook(() => useMonthlyTrend(base, "transport"));
    expect(result.current.points.at(-1)?.spentMinor ?? 0).toBe(0);
  });

  it("з правилом обидві операції Сільпо йдуть у тренд «Транспорту»", () => {
    const { result } = renderHook(() =>
      useMonthlyTrend({ ...base, merchantRules: RULES }, "transport"),
    );
    expect(result.current.points.at(-1)?.spentMinor).toBe(20_000);
  });

  it("явний override однієї операції сильніший за правило", () => {
    const { result } = renderHook(() =>
      useMonthlyTrend(
        { ...base, merchantRules: RULES, txCategories: { s2: "food" } },
        "transport",
      ),
    );
    expect(result.current.points.at(-1)?.spentMinor).toBe(12_000);
  });
});
