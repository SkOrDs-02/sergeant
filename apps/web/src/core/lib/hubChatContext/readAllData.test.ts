// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../modules/finyk/lib/monoMirrorReader";
import { readAllData } from "./readAllData";

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
});

describe("readAllData", () => {
  it("returns empty defaults when caches are empty", () => {
    const d = readAllData();
    expect(d.transactions).toEqual([]);
    expect(d.accounts).toEqual([]);
    expect(d.clientName).toBe("");
    expect(d.cacheTime).toBeNull();
    expect(d.statTx).toEqual([]);
    expect(d.excludedIds.size).toBe(0);
  });

  it("reads tx and account slices from the Mono mirror cache", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [{ id: "t1", amount: -100 } as never],
      accounts: [{ id: "a1", balance: 5 }],
      refreshedAt: "2026-06-01T00:00:00.000Z",
    });
    const d = readAllData();
    expect(d.transactions).toHaveLength(1);
    expect(d.accounts).toHaveLength(1);
    expect(d.clientName).toBe("");
    expect(d.cacheTime).toBe(new Date("2026-06-01T00:00:00.000Z").getTime());
  });

  it("computes excludedIds from hidden txs, transfers and receivable links", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -100 },
        { id: "t2", amount: -200 },
        { id: "t3", amount: -300 },
        { id: "t4", amount: -400 },
      ] as never[],
    });
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["t1"]));
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({ t2: "internal_transfer" }),
    );
    localStorage.setItem(
      "finyk_recv",
      JSON.stringify([
        { id: "r1", name: "X", amount: 10, linkedTxIds: ["t3"] },
      ]),
    );
    const d = readAllData();
    expect(d.excludedIds.has("t1")).toBe(true);
    expect(d.excludedIds.has("t2")).toBe(true);
    expect(d.excludedIds.has("t3")).toBe(true);
    expect(d.statTx.map((t) => t.id)).toEqual(["t4"]);
  });
});
