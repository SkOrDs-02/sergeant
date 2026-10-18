// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../lib/monoMirrorReader";
import { mergeBankHistory, useBankHistoryTx } from "./useBankHistoryTx";

function tx(id: string, amount: number, time: number): Transaction {
  return {
    id,
    amount,
    time,
    date: "2026-09-29",
    description: "",
    mcc: 0,
    categoryId: "other",
    type: amount > 0 ? "income" : "expense",
    source: "mono",
    accountId: "mono-1",
    manual: false,
    _source: "mono",
    _accountId: "mono-1",
    _manual: false,
  };
}

describe("mergeBankHistory", () => {
  it("та сама tx у мережі й у дзеркалі рахується один раз, мережа виграє", () => {
    const net = tx("a", -20000, 2_000);
    const mirrored = { ...tx("a", -99999, 2_000), description: "зі дзеркала" };
    const merged = mergeBankHistory([net], [mirrored]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(net);
  });

  it("дзеркало добирає записи, яких нема в мережі, і сортує за часом спадно", () => {
    const merged = mergeBankHistory(
      [tx("n1", -100, 3_000)],
      [tx("m1", -200, 1_000), tx("m2", -300, 2_000)],
    );
    expect(merged.map((t) => t.id)).toEqual(["n1", "m2", "m1"]);
  });

  it("повертає той самий масив мережі, якщо дзеркало нічого не додає", () => {
    const net = [tx("a", -100, 1)];
    expect(mergeBankHistory(net, [])).toBe(net);
    expect(mergeBankHistory(net, [tx("a", -100, 1)])).toBe(net);
  });

  it("дубль усередині самого дзеркала теж береться раз", () => {
    const merged = mergeBankHistory([], [tx("m", -1, 1), tx("m", -1, 1)]);
    expect(merged).toHaveLength(1);
  });
});

describe("useBankHistoryTx", () => {
  afterEach(() => {
    clearFinykMonoMirrorCache();
  });

  it("читає дзеркало SQLite і зливає його з мережевим realTx", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [tx("old", -165000, 1_000), tx("dup", -100, 2_000)],
    });
    const net = [tx("dup", -100, 2_000), tx("new", -20000, 3_000)];
    const { result } = renderHook(() => useBankHistoryTx(net));
    expect(result.current.map((t) => t.id)).toEqual(["new", "dup", "old"]);
  });
});
