// @vitest-environment jsdom
// Web-only unit tests для `lsStats` хелперів, які читають локальний `localStorage`.
// Pure-тести (getIncomeCategory/getCategory/fmt* тощо) мігровані у
// `packages/finyk-domain/src/utils.test.ts` у рамках R3.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getFinykExcludedTxIdsFromStorage,
  getFinykTxSplitsFromStorage,
} from "./utils";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("getFinykExcludedTxIdsFromStorage", () => {
  it("повертає пустий Set коли localStorage порожній", () => {
    const s = getFinykExcludedTxIdsFromStorage();
    expect(s).toBeInstanceOf(Set);
    expect(s.size).toBe(0);
  });
  it("об'єднує hidden + internal_transfer + recv.linkedTxIds + extra", () => {
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["a"]));
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({ b: INTERNAL_TRANSFER_ID, c: "food" }),
    );
    localStorage.setItem(
      "finyk_recv",
      JSON.stringify([{ linkedTxIds: ["d", "e"] }]),
    );
    localStorage.setItem("finyk_excluded_stat_txs", JSON.stringify(["f"]));
    const s = getFinykExcludedTxIdsFromStorage();
    expect(s.has("a")).toBe(true);
    expect(s.has("b")).toBe(true);
    expect(s.has("c")).toBe(false);
    expect(s.has("d")).toBe(true);
    expect(s.has("e")).toBe(true);
    expect(s.has("f")).toBe(true);
  });
});

describe("getFinykTxSplitsFromStorage", () => {
  it("повертає {} коли немає даних", () => {
    expect(getFinykTxSplitsFromStorage()).toEqual({});
  });
  it("повертає збережений об'єкт", () => {
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({ t1: [{ amount: 10, categoryId: "food" }] }),
    );
    const v = getFinykTxSplitsFromStorage() as Record<string, unknown[]>;
    expect(v["t1"]).toHaveLength(1);
  });
  it("повертає {} коли значення — не об'єкт", () => {
    localStorage.setItem("finyk_tx_splits", JSON.stringify("string"));
    expect(getFinykTxSplitsFromStorage()).toEqual({});
  });
});
