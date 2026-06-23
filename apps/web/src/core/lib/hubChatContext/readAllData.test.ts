// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { readAllData } from "./readAllData";

beforeEach(() => localStorage.clear());

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

  it("reads tx cache and info cache (flat shape)", () => {
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [{ id: "t1", amount: -100 }],
        timestamp: 1700000000,
      }),
    );
    localStorage.setItem(
      "finyk_info_cache",
      JSON.stringify({ accounts: [{ id: "a1", balance: 5 }], name: "Олег" }),
    );
    const d = readAllData();
    expect(d.transactions).toHaveLength(1);
    expect(d.accounts).toHaveLength(1);
    expect(d.clientName).toBe("Олег");
    expect(d.cacheTime).toBe(1700000000);
  });

  it("reads info cache wrapped in { info } shape", () => {
    localStorage.setItem(
      "finyk_info_cache",
      JSON.stringify({ info: { accounts: [{ id: "a2" }], name: "Іван" } }),
    );
    const d = readAllData();
    expect(d.clientName).toBe("Іван");
    expect(d.accounts).toHaveLength(1);
  });

  it("computes excludedIds from hidden txs, transfers and receivable links", () => {
    localStorage.setItem(
      "finyk_tx_cache",
      JSON.stringify({
        txs: [
          { id: "t1", amount: -100 },
          { id: "t2", amount: -200 },
          { id: "t3", amount: -300 },
          { id: "t4", amount: -400 },
        ],
      }),
    );
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
