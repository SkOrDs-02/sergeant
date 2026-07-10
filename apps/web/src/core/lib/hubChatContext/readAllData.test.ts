// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readAllData } from "./readAllData";
import {
  __setFinykMonoMirrorCacheForTests,
  clearFinykMonoMirrorCache,
} from "../../../modules/finyk/lib/monoMirrorReader";

beforeEach(() => {
  localStorage.clear();
  clearFinykMonoMirrorCache();
});

describe("readAllData", () => {
  it("returns empty defaults when localStorage is empty", () => {
    const d = readAllData();
    expect(d.transactions).toEqual([]);
    expect(d.accounts).toEqual([]);
    expect(d.clientName).toBe("");
    expect(d.cacheTime).toBeNull();
    expect(d.statTx).toEqual([]);
    expect(d.excludedIds.size).toBe(0);
  });

  it("reads transactions and accounts from the Mono mirror cache", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [{ id: "t1", amount: -100 } as never],
      accounts: [{ id: "a1", balance: 5 }],
    });
    const d = readAllData();
    expect(d.transactions).toHaveLength(1);
    expect(d.accounts).toHaveLength(1);
    // clientName is no longer derived from finyk_info_cache — it is always "".
    expect(d.clientName).toBe("");
    expect(d.cacheTime).not.toBeNull();
  });

  it("accounts from mirror cache are exposed directly", () => {
    __setFinykMonoMirrorCacheForTests({
      accounts: [{ id: "a2", balance: 99 }],
    });
    const d = readAllData();
    expect(d.accounts).toHaveLength(1);
    expect((d.accounts[0] as { id: string }).id).toBe("a2");
    expect(d.clientName).toBe("");
  });

  it("computes excludedIds from hidden txs, transfers and receivable links", () => {
    __setFinykMonoMirrorCacheForTests({
      transactions: [
        { id: "t1", amount: -100 } as never,
        { id: "t2", amount: -200 } as never,
        { id: "t3", amount: -300 } as never,
        { id: "t4", amount: -400 } as never,
      ],
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
