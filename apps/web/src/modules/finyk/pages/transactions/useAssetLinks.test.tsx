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

function setup(
  activeTx: Transaction[],
  initial = [deposit, fund],
  transferTxIds: ReadonlySet<string> = new Set(),
) {
  const overrideCategory = vi.fn();
  const hook = renderHook(() => {
    const [assets, setAssets] = useState<ManualAsset[]>(initial);
    const links = useAssetLinks({
      storageReady: true,
      activeTx,
      hiddenTxIds: [],
      excludedTxIds: new Set(),
      transferTxIds,
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
      suggestions.map((s) => [s.tx.id, s.type, s.assets.map((a) => a.id)]),
    ).toEqual([["t2", "contribution", ["fund"]]]);

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

  describe("інвестиційні сигнали (спека finyk-investment-suggestions)", () => {
    const ovdpEur: ManualAsset = {
      id: "ovdp",
      name: "ОВДП EUR",
      amount: 0,
      currency: "EUR",
      kind: "ovdp",
      status: "active",
      events: [],
      fxRate: { uahPerUnit: 50, asOf: "2026-03-01" },
    };
    // EUR-картка, перерахована за курсом НБУ: `amount` у гривнях.
    const bondBuy: Transaction = {
      ...tx("b1", -10_292_533, "Купівля облігацій"),
      mcc: 4829,
      accountCurrencyCode: 978,
      accountAmount: -203_884,
      amountUah: -10_292_533,
      fxRate: { uahPerUnit: 50.4823, date: "2026-03-05" },
    };

    it("купівля облігацій з активом ОВДП: внесок у валюті рахунку", () => {
      const { hook } = setup([bondBuy], [deposit, ovdpEur]);
      const [s] = hook.result.current.links.suggestions;
      expect([s?.type, s?.kind, s?.assets.map((a) => a.id)]).toEqual([
        "contribution",
        "ovdp",
        ["ovdp"],
      ]);
      act(() => hook.result.current.links.accept(s!));
      expect(eventsOf(hook.result.current.assets, "ovdp")).toEqual([
        expect.objectContaining({
          type: "contribution",
          txId: "b1",
          amountMinor: 203_884,
        }),
      ]);
      expect(hook.result.current.links.suggestions).toEqual([]);
    });

    it("без активу ОВДП: створений з операції актив привʼязує її першим внеском", () => {
      const { hook } = setup([bondBuy], [deposit]);
      const [s] = hook.result.current.links.suggestions;
      expect([s?.assets.length, s?.kind]).toEqual([0, "ovdp"]);
      const created: ManualAsset = {
        ...ovdpEur,
        id: "new",
        events: [
          {
            id: "e1",
            type: "contribution",
            date: "2026-03-05",
            amountMinor: 203_884,
            count: 2,
          },
        ],
      };
      act(() => hook.result.current.links.createFrom(s!, created));
      expect(eventsOf(hook.result.current.assets, "new")).toEqual([
        expect.objectContaining({
          type: "contribution",
          txId: "b1",
          merchantKey: "купівля облігацій",
        }),
      ]);
      expect(hook.result.current.links.suggestions).toEqual([]);
    });

    it("відкриття депозиту пропонує депозит", () => {
      const { hook } = setup([tx("d1", -22_923_100, "Відкриття депозиту")]);
      const [s] = hook.result.current.links.suggestions;
      expect([s?.type, s?.kind, s?.assets.map((a) => a.id)]).toEqual([
        "contribution",
        "deposit",
        ["dep"],
      ]);
    });

    it("процент від облігацій: дохід лише за наявного активу ОВДП", () => {
      const coupon = tx("c1", 157_638, "Процент від облігацій");
      expect(setup([coupon]).hook.result.current.links.suggestions).toEqual([]);
      const { hook, overrideCategory } = setup([coupon], [ovdpEur]);
      const [s] = hook.result.current.links.suggestions;
      expect(s?.type).toBe("income");
      act(() => hook.result.current.links.accept(s!));
      expect(overrideCategory).toHaveBeenLastCalledWith("c1", "in_assets");
    });

    it("надходження від того, кому вносили, пропонується як повернення", () => {
      const paid: ManualAsset = {
        ...fund,
        events: [
          {
            id: "e",
            type: "contribution",
            date: "2026-02-01",
            amountMinor: 9_936_500,
            txId: "old",
            merchantKey: "тов інжур кепітал",
          },
        ],
      };
      const back = tx("w1", 5_000_000, 'ТОВ "ІНЖУР КЕПІТАЛ"');
      const { hook } = setup([back], [paid]);
      const [s] = hook.result.current.links.suggestions;
      expect([s?.type, s?.assets.map((a) => a.id)]).toEqual([
        "withdrawal",
        ["fund"],
      ]);
    });

    it("погашення кредиту й нога пари переказу карток не отримують", () => {
      const { hook } = setup(
        [
          tx("k1", -500_000, "Повне погашення"),
          tx("k2", -80_000, "Погашення наступного платежу"),
          tx("d2", -100_000, "Відкриття депозиту"),
        ],
        [deposit],
        new Set(["d2"]),
      );
      expect(hook.result.current.links.suggestions).toEqual([]);
    });
  });
});
