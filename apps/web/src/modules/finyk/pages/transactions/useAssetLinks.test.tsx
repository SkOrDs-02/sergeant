// @vitest-environment jsdom
/**
 * Привʼязка операцій до рахунків-активів і пропозиції «Схоже на внесок у …»
 * (спека `docs/work/specs/finyk-savings-assets.md`).
 */
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import type { ManualAsset } from "../../hooks/useStorage";
import {
  markStorageBooting,
  markStorageReady,
} from "../../../../core/db/storageReady";
import { useAssetLinks } from "./useAssetLinks";

function tx(id: string, amount: number, description: string): Transaction {
  return {
    id,
    amount,
    description,
    time: Math.floor(new Date("2026-03-05T10:00:00").getTime() / 1000),
    date: "2026-03-05",
    categoryId: "other",
    type: amount < 0 ? "expense" : "income",
    source: "mono",
    mcc: 0,
    accountId: "card",
    manual: false,
    _source: "monobank",
    _accountId: "card",
    _manual: false,
  };
}

const deposit: ManualAsset = {
  id: "dep",
  name: "Депозит",
  amount: 0,
  currency: "UAH",
  kind: "deposit",
  status: "active",
  events: [],
};
const fund: ManualAsset = {
  id: "fund",
  name: "Інжур",
  amount: 0,
  currency: "UAH",
  kind: "fund",
  status: "active",
  events: [],
};

function setup(activeTx: Transaction[], initial = [deposit, fund]) {
  const overrideCategory = vi.fn();
  const hook = renderHook(() => {
    const [assets, setAssets] = useState<ManualAsset[]>(initial);
    const links = useAssetLinks({
      storageReady: true,
      activeTx,
      hiddenTxIds: [],
      excludedTxIds: new Set(),
      manualAssets: assets,
      setManualAssets: setAssets,
      overrideCategory,
    });
    return { assets, links };
  });
  return { hook, overrideCategory };
}

const eventsOf = (assets: ManualAsset[], id: string) =>
  (assets.find((a) => a.id === id)?.["events"] ?? []) as {
    type: string;
    txId?: string;
    amountMinor: number;
    merchantKey?: string;
  }[];

describe("useAssetLinks", () => {
  beforeEach(() => {
    localStorage.clear();
    markStorageReady();
  });

  it("внесок, перенос на інший актив і відвʼязка — одна операція в одному активі", () => {
    const t1 = tx("t1", -500_000, "Inzhur payment");
    const { hook } = setup([t1]);
    act(() =>
      hook.result.current.links
        .linkFor(t1)!
        .onLink("dep", "contribution", 500_000),
    );
    expect(eventsOf(hook.result.current.assets, "dep")).toEqual([
      expect.objectContaining({
        type: "contribution",
        txId: "t1",
        amountMinor: 500_000,
      }),
    ]);
    expect(hook.result.current.links.linkFor(t1)!.current).toEqual({
      assetId: "dep",
      type: "contribution",
    });

    act(() =>
      hook.result.current.links
        .linkFor(t1)!
        .onLink("fund", "contribution", 500_000),
    );
    expect(eventsOf(hook.result.current.assets, "dep")).toEqual([]);
    expect(eventsOf(hook.result.current.assets, "fund")).toHaveLength(1);

    act(() => hook.result.current.links.linkFor(t1)!.onUnlink());
    expect(eventsOf(hook.result.current.assets, "fund")).toEqual([]);
  });

  it("дохід з активу ставить категорію in_assets і знімає її при відвʼязці", () => {
    const coupon = tx("c1", 3_000, "Купон ОВДП");
    const { hook, overrideCategory } = setup([coupon]);
    act(() =>
      hook.result.current.links.linkFor(coupon)!.onLink("dep", "income", 3_000),
    );
    expect(overrideCategory).toHaveBeenLastCalledWith("c1", "in_assets");
    act(() => hook.result.current.links.linkFor(coupon)!.onUnlink());
    expect(overrideCategory).toHaveBeenLastCalledWith("c1", null);
  });

  it("пропонує наступне списання тому ж отримувачу; «Ні» не повертається", () => {
    const first = tx("t1", -500_000, "Inzhur payment");
    const second = tx("t2", -300_000, "Inzhur payment");
    const other = tx("t3", -9_900, "Сільпо");
    const { hook } = setup([first, second, other]);
    act(() =>
      hook.result.current.links
        .linkFor(first)!
        .onLink("fund", "contribution", 500_000),
    );
    const suggestions = hook.result.current.links.suggestions;
    expect(
      suggestions.map((s) => [s.tx.id, s.asset.id, s.amountMinor]),
    ).toEqual([["t2", "fund", 300_000]]);

    act(() => hook.result.current.links.reject(suggestions[0]!));
    expect(hook.result.current.links.suggestions).toEqual([]);
    expect(
      JSON.parse(
        localStorage.getItem("finyk_asset_link_suggestion_rejected_tx_v1") ??
          "[]",
      ),
    ).toEqual(["t2"]);
  });

  it("поки сховище не прогріте, пропозицій немає (відмови ще не прочитані)", () => {
    markStorageBooting();
    const linked: ManualAsset = {
      ...fund,
      events: [
        {
          id: "e",
          type: "contribution",
          date: "2026-02-01",
          amountMinor: 1,
          txId: "old",
          merchantKey: "inzhur payment",
        },
      ],
    };
    const { hook } = setup(
      [tx("t2", -300_000, "Inzhur payment")],
      [deposit, linked],
    );
    expect(hook.result.current.links.suggestions).toEqual([]);
    act(() => markStorageReady());
    hook.rerender();
    expect(hook.result.current.links.suggestions).toHaveLength(1);
  });
});
