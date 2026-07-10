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
  // Mirror cache mock — replaced by vi.mock below.
  // Explicit casts widen the inferred types so mockReturnValue() with
  // non-empty transactions / non-null refreshedAt passes tsc.
  getMirrorState: vi.fn(() => ({
    transactions: [] as Array<{ id: string; amount: number }>,
    accounts: [] as unknown[],
    refreshedAt: null as string | null,
  })),
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

vi.mock("../../finyk/lib/monoMirrorReader", () => ({
  getCachedFinykMonoMirrorStateWithLastGood: () => deps.getMirrorState(),
}));

describe("finykSubscriptionCalendar", () => {
  beforeEach(() => {
    deps.safeReadLS.mockReset();
    deps.buildPure.mockClear();
    deps.getAmountMeta.mockClear();
    deps.getMirrorState.mockReset();
    deps.getMirrorState.mockReturnValue({
      transactions: [],
      accounts: [],
      refreshedAt: null,
    });
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

  it("loads transactions from the mirror cache with last-good fallback", () => {
    const mirrorTxs = [{ id: "tx-mirror", amount: -999 }];
    deps.getMirrorState.mockReturnValue({
      transactions: mirrorTxs,
      accounts: [],
      refreshedAt: "2026-07-05T10:00:00.000Z",
    });

    const result = loadFinykTransactionsFromStorage();
    expect(result).toBe(mirrorTxs);
  });

  it("returns empty array when mirror cache is empty", () => {
    deps.getMirrorState.mockReturnValue({
      transactions: [],
      accounts: [],
      refreshedAt: null,
    });

    expect(loadFinykTransactionsFromStorage()).toEqual([]);
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

    deps.safeReadLS.mockImplementation((key: string) => {
      if (key === deps.storageKeys.FINYK_SUBS) return [storedSub];
      return null;
    });
    deps.getMirrorState.mockReturnValue({
      transactions: txs,
      accounts: [],
      refreshedAt: "2026-07-05T10:00:00.000Z",
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
