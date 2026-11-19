/**
 * Привʼязані операції й «Відкладено за місяць» (спека
 * `docs/work/specs/finyk-savings-assets.md`).
 */
import { describe, expect, it } from "vitest";

import { buildFinykExcludedTxIds } from "../../lib/metrics.js";
import {
  assetIncomeTxIds,
  assetLinkByTxId,
  assetTransferTxIds,
  computeMonthlySaved,
  jarNetMinor,
} from "./savings.js";
import type { ManualAsset } from "./types.js";

const deposit: ManualAsset = {
  id: "dep",
  name: "Депозит",
  amount: 0,
  currency: "UAH",
  kind: "deposit",
  events: [
    {
      id: "1",
      type: "contribution",
      date: "2026-03-05",
      amountMinor: 500_000,
      txId: "tx-in",
    },
    {
      id: "2",
      type: "income",
      date: "2026-03-20",
      amountMinor: 3_000,
      txId: "tx-coupon",
    },
    {
      id: "3",
      type: "withdrawal",
      date: "2026-03-25",
      amountMinor: 100_000,
      txId: "tx-out",
    },
    { id: "4", type: "contribution", date: "2026-02-28", amountMinor: 999_999 },
  ],
};

const usdOvdp: ManualAsset = {
  id: "ovdp",
  name: "ОВДП $",
  amount: 0,
  currency: "USD",
  kind: "ovdp",
  fxRate: { uahPerUnit: 41.5, asOf: "2026-03-01" },
  events: [
    {
      id: "5",
      type: "contribution",
      date: "2026-03-10",
      amountMinor: 100_000,
      txId: "tx-usd",
    },
  ],
};

describe("привʼязані операції", () => {
  it("внески й повернення — перекази, виплата доходу — ні", () => {
    expect([...assetTransferTxIds([deposit, usdOvdp])].sort()).toEqual([
      "tx-in",
      "tx-out",
      "tx-usd",
    ]);
    expect([...assetIncomeTxIds([deposit])]).toEqual(["tx-coupon"]);
    expect(assetLinkByTxId([deposit]).get("tx-coupon")).toEqual({
      assetId: "dep",
      type: "income",
    });
  });

  it("excluded-set статистики бере внески й повернення, але не дохід", () => {
    const excluded = buildFinykExcludedTxIds({
      assetTransferTxIds: assetTransferTxIds([deposit]),
    });
    expect(excluded.has("tx-in")).toBe(true);
    expect(excluded.has("tx-out")).toBe(true);
    expect(excluded.has("tx-coupon")).toBe(false);
  });
});

describe("«Відкладено за місяць»", () => {
  const jarIds = ["jar-1"];
  const t = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  const jarTxs = [
    { accountId: "jar-1", amount: 200_000, time: t("2026-03-03T12:00:00") },
    { accountId: "jar-1", amount: -50_000, time: t("2026-03-15T12:00:00") },
    { accountId: "jar-1", amount: 70_000, time: t("2026-04-01T12:00:00") },
    { accountId: "card", amount: -999, time: t("2026-03-15T12:00:00") },
  ];

  it("внески − повернення + чисте поповнення банок, за курсом активу", () => {
    const saved = computeMonthlySaved({
      assets: [deposit, usdOvdp],
      from: "2026-03-01",
      to: "2026-04-01",
      jarTransactions: jarTxs,
      jarAccountIds: jarIds,
    });
    // Депозит: 5 000 − 1 000 = 4 000 грн; ОВДП: 1 000 $ × 41,5 = 41 500 грн.
    expect(saved.assetsMinor).toBe(400_000 + 4_150_000);
    expect(saved.jarsMinor).toBe(150_000);
    expect(saved.totalMinor).toBe(4_700_000);
    expect(saved.byAsset).toEqual([
      { assetId: "dep", name: "Депозит", minor: 400_000 },
      { assetId: "ovdp", name: "ОВДП $", minor: 4_150_000 },
    ]);
    expect(saved.unconvertedCount).toBe(0);
  });

  it("негривневий актив без курсу не рахується, але його названо", () => {
    const noRate: ManualAsset = { ...usdOvdp, fxRate: null };
    const saved = computeMonthlySaved({
      assets: [noRate],
      from: "2026-03-01",
      to: "2026-04-01",
    });
    expect(saved.totalMinor).toBe(0);
    expect(saved.unconvertedCount).toBe(1);
  });

  it("повернення, яким закрито актив, зменшує свій місяць", () => {
    const closed: ManualAsset = {
      ...deposit,
      status: "closed",
      events: [
        {
          id: "9",
          type: "withdrawal",
          date: "2026-05-10",
          amountMinor: 600_000,
        },
      ],
    };
    const saved = computeMonthlySaved({
      assets: [closed],
      from: "2026-05-01",
      to: "2026-06-01",
    });
    expect(saved.totalMinor).toBe(-600_000);
  });

  it("банки поза вікном і чужі рахунки не входять", () => {
    expect(jarNetMinor(jarTxs, jarIds, "2026-04-01", "2026-05-01")).toBe(
      70_000,
    );
    expect(jarNetMinor(jarTxs, [], "2026-03-01", "2026-04-01")).toBe(0);
  });
});
