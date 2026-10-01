// @vitest-environment jsdom
/**
 * Хаб-споживачі (тижневий звіт, інсайти бюджету) читають категорії з
 * `slots.txCategories`. Правила «Завжди так для цього магазину» (2026-10-01)
 * доходять до них через ЕФЕКТИВНУ мапу, яку віддає цей хук: явні override-и
 * плюс виведене правилами. Сам слот при цьому не змінюється.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";

const slotsRef = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("./useFinykStorageSlots", () => ({
  useFinykStorageSlots: () => slotsRef.current,
}));

import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../lib/monoMirrorReader";
import { useFinykStatTransactions } from "./useFinykStatTransactions";

const RULE = {
  id: "mr_1",
  kind: "expense",
  merchantKey: "сільпо",
  categoryId: "transport",
  label: "Сільпо",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
};

function slots(overrides: Record<string, unknown> = {}) {
  return {
    manualExpenses: [],
    hiddenTxIds: [],
    txCategories: {},
    receivables: [],
    excludedStatTxIds: [],
    customCategories: [],
    merchantRules: [RULE],
    ...overrides,
  };
}

describe("useFinykStatTransactions × правила мерчантів", () => {
  beforeEach(() => {
    clearFinykMonoMirrorCache();
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -10_000, description: "Сільпо №5" },
        { id: "t2", amount: -20_000, description: "СІЛЬПО 12" },
        { id: "t3", amount: -30_000, description: "АТБ" },
      ] as never[],
    });
  });
  afterEach(() => clearFinykMonoMirrorCache());

  it("віддає ефективну мапу: правило виводить категорію, явний override сильніший", () => {
    slotsRef.current = slots({ txCategories: { t2: "food" } });
    const { result } = renderHook(() => useFinykStatTransactions());
    expect(result.current.slots.txCategories).toEqual({
      t1: "transport",
      t2: "food",
    });
  });

  it("сам слот не мутує: у запис ідуть лише явні override-и", () => {
    const explicit = { t2: "food" };
    slotsRef.current = slots({ txCategories: explicit });
    renderHook(() => useFinykStatTransactions());
    expect(explicit).toEqual({ t2: "food" });
  });

  it("без правил віддає ТОЙ САМИЙ обʼєкт явних override-ів", () => {
    const explicit = { t2: "food" };
    slotsRef.current = slots({ txCategories: explicit, merchantRules: [] });
    const { result } = renderHook(() => useFinykStatTransactions());
    expect(result.current.slots.txCategories).toBe(explicit);
  });

  it("правило не робить операцію переказом: виключення рахуються з явних override-ів", () => {
    slotsRef.current = slots({
      txCategories: { t3: INTERNAL_TRANSFER_ID },
      merchantRules: [
        RULE,
        // Правило на «Внутрішній переказ» санітайзер відкидає.
        {
          ...RULE,
          id: "mr_bad",
          merchantKey: "атб",
          categoryId: INTERNAL_TRANSFER_ID,
        },
      ],
    });
    const { result } = renderHook(() => useFinykStatTransactions());
    const ids = result.current.statTransactions.map((t) => t.id);
    expect(ids).toEqual(["t1", "t2"]);
  });
});
