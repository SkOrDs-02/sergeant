// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { INTERNAL_TRANSFER_ID } from "../constants";
import {
  getFinykExcludedTxIdsFromStorage,
  getFinykTxSplitsFromStorage,
  readFinykStatsContext,
} from "./lsStats";

beforeEach(() => {
  localStorage.clear();
});

describe("lsStats", () => {
  it("combines hidden, transfer, receivable, and extra excluded ids", () => {
    localStorage.setItem("finyk_hidden_txs", JSON.stringify(["hidden-1"]));
    localStorage.setItem(
      "finyk_tx_cats",
      JSON.stringify({
        txFood: "food",
        txTransfer: INTERNAL_TRANSFER_ID,
      }),
    );
    localStorage.setItem(
      "finyk_recv",
      JSON.stringify([{ linkedTxIds: ["recv-1", "recv-2"] }, {}]),
    );
    localStorage.setItem(
      "finyk_excluded_stat_txs",
      JSON.stringify(["extra-1"]),
    );

    expect([...getFinykExcludedTxIdsFromStorage()].sort()).toEqual([
      "extra-1",
      "hidden-1",
      "recv-1",
      "recv-2",
      "txTransfer",
    ]);
  });

  it("returns only valid split/category/custom-category shapes in stats context", () => {
    localStorage.setItem(
      "finyk_tx_splits",
      JSON.stringify({ tx1: [{ categoryId: "food", amount: 100 }] }),
    );
    localStorage.setItem("finyk_tx_cats", JSON.stringify(["bad-shape"]));
    localStorage.setItem("finyk_custom_cats_v1", JSON.stringify({ bad: true }));

    expect(getFinykTxSplitsFromStorage()).toEqual({
      tx1: [{ categoryId: "food", amount: 100 }],
    });
    expect(readFinykStatsContext()).toMatchObject({
      txCategories: {},
      customCategories: [],
      txSplits: { tx1: [{ categoryId: "food", amount: 100 }] },
    });
  });
});
