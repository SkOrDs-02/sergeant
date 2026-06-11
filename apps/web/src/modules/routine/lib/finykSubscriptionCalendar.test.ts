import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFinykSubscriptionEvents,
  FINYK_SUB_GROUP_LABEL,
  loadFinykSubscriptionsFromStorage,
  loadFinykTransactionsFromStorage,
} from "./finykSubscriptionCalendar";

type CalendarRange = { startKey: string; endKey: string };
type Subscription = {
  id: string;
  name?: string;
  billingDay: number;
  linkedTxId?: string;
  currency?: string;
};
type Transaction = { id: string; amount: number };
type AmountLookup = (sub: Subscription) => {
  amount: number | null;
  currency: string;
};

const deps = vi.hoisted(() => ({
  groupLabel: "Фінік · підписки",
  storageKeys: {
    FINYK_SUBS: "finyk_subs",
    FINYK_TX_CACHE: "finyk_tx_cache",
    FINYK_TX_CACHE_LAST_GOOD: "finyk_tx_cache_last_good",
  },
  safeReadLS: vi.fn(),
  buildPure: vi.fn(
    (range: CalendarRange, subs: Subscription[], getAmount: AmountLookup) =>
      subs.map((sub) => {
        const amountMeta = getAmount(sub);
        return {
          id: `finyk_sub_${sub.id}_${range.startKey}`,
          date: range.startKey,
          title: sub.name ?? "Підписка",
          subtitle:
            amountMeta.amount === null
              ? "сума з транзакції або вручну у Фініку"
              : `~${amountMeta.amount} ${amountMeta.currency}`,
          tagLabels: [deps.groupLabel],
          finykSub: true,
          sourceKind: "finyk_sub",
        };
      }),
  ),
  getAmountMeta: vi.fn((sub: Subscription, txs: Transaction[]) => {
    const tx = txs.find((item) => item.id === sub.linkedTxId);
    return {
      amount: tx ? Math.abs(tx.amount / 100) : null,
      currency: sub.currency === "USD" ? "$" : "₴",
      lastTx: tx ?? null,
    };
  }),
}));

vi.mock("@shared/lib/storage/storage", () => ({
  safeReadLS: deps.safeReadLS,
}));

vi.mock("@sergeant/shared", () => ({
  STORAGE_KEYS: deps.storageKeys,
}));

vi.mock("@sergeant/finyk-domain/domain/subscriptionUtils", () => ({
  getSubscriptionAmountMeta: deps.getAmountMeta,
}));

vi.mock("@sergeant/routine-domain", () => ({
  buildFinykSubscriptionEvents: deps.buildPure,
  FINYK_SUB_GROUP_LABEL: deps.groupLabel,
}));

describe("finykSubscriptionCalendar", () => {
  beforeEach(() => {
    deps.safeReadLS.mockReset();
    deps.buildPure.mockClear();
    deps.getAmountMeta.mockClear();
  });

  it("re-exports the routine-domain Finyk subscription group label", () => {
    expect(FINYK_SUB_GROUP_LABEL).toBe(deps.groupLabel);
  });

  it("returns an empty list when storage is missing or empty (no preset injection)", () => {
    // Fresh installs must NOT inherit the preset catalog — the old
    // `DEFAULT_SUBSCRIPTIONS` fallback put 7 foreign subscriptions into
    // new visitors' calendars (live-deploy audit 2026-06-11).
    deps.safeReadLS.mockReturnValueOnce(null);

    expect(loadFinykSubscriptionsFromStorage()).toEqual([]);
    expect(deps.safeReadLS).toHaveBeenCalledWith(
      deps.storageKeys.FINYK_SUBS,
      null,
    );

    deps.safeReadLS.mockReturnValueOnce([]);

    expect(loadFinykSubscriptionsFromStorage()).toEqual([]);
  });

  it("returns stored subscriptions when storage has a non-empty array", () => {
    const stored = [
      {
        id: "spotify",
        name: "Spotify",
        billingDay: 7,
        currency: "USD",
      },
    ];
    deps.safeReadLS.mockReturnValueOnce(stored);

    expect(loadFinykSubscriptionsFromStorage()).toBe(stored);
  });

  it("loads transactions from the primary cache before the last-good cache", () => {
    const primaryTxs = [{ id: "tx-primary", amount: -999 }];
    deps.safeReadLS.mockReturnValueOnce({ txs: primaryTxs });

    expect(loadFinykTransactionsFromStorage()).toBe(primaryTxs);
    expect(deps.safeReadLS).toHaveBeenCalledTimes(1);
    expect(deps.safeReadLS).toHaveBeenCalledWith(
      deps.storageKeys.FINYK_TX_CACHE,
      null,
    );

    const fallbackTxs = [{ id: "tx-fallback", amount: -777 }];
    deps.safeReadLS.mockReset();
    deps.safeReadLS
      .mockReturnValueOnce({ txs: [] })
      .mockReturnValueOnce({ txs: fallbackTxs });

    expect(loadFinykTransactionsFromStorage()).toBe(fallbackTxs);
    expect(deps.safeReadLS).toHaveBeenNthCalledWith(
      1,
      deps.storageKeys.FINYK_TX_CACHE,
      null,
    );
    expect(deps.safeReadLS).toHaveBeenNthCalledWith(
      2,
      deps.storageKeys.FINYK_TX_CACHE_LAST_GOOD,
      null,
    );
  });

  it("bridges stored subscriptions and cached transactions into the pure builder", () => {
    const storedSub = {
      id: "notion",
      name: "Notion",
      billingDay: 15,
      linkedTxId: "tx-notion",
      currency: "USD",
    };
    const txs = [{ id: "tx-notion", amount: -12345 }];
    deps.safeReadLS.mockImplementation((key) => {
      if (key === deps.storageKeys.FINYK_SUBS) return [storedSub];
      if (key === deps.storageKeys.FINYK_TX_CACHE) return { txs };
      return null;
    });

    const range = {
      startKey: "2025-06-15",
      endKey: "2025-06-16",
    };
    const events = buildFinykSubscriptionEvents(range);

    expect(deps.buildPure).toHaveBeenCalledWith(
      range,
      [storedSub],
      expect.any(Function),
    );
    expect(deps.getAmountMeta).toHaveBeenCalledWith(storedSub, txs);
    expect(events).toEqual([
      expect.objectContaining({
        id: "finyk_sub_notion_2025-06-15",
        date: "2025-06-15",
        subtitle: "~123.45 $",
        tagLabels: [deps.groupLabel],
        finykSub: true,
        sourceKind: "finyk_sub",
      }),
    ]);
  });
});
