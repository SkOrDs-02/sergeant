// Pure-helpers `subscriptionUtils`: знаходження "останньої релевантної"
// транзакції підписки (manual link → keyword) та згортка amount/currency
// для UI.
import { describe, expect, it } from "vitest";

import {
  getLastTxForSubscription,
  getSubscriptionAmountMeta,
} from "./subscriptionUtils.js";
import { CURRENCY } from "../constants.js";

describe("getLastTxForSubscription", () => {
  it("повертає null коли transactions порожні", () => {
    expect(getLastTxForSubscription({}, [])).toBeNull();
  });

  it("повертає null коли transactions null/undefined-like (false-y)", () => {
    // У сигнатурі — required, але код перевіряє `!transactions || !length`.
    // Покриваємо guard.
    expect(getLastTxForSubscription({}, null as unknown as never[])).toBeNull();
  });

  it("повертає прив'язану tx, якщо linkedTxId знайдено і вона витратна", () => {
    const transactions = [
      { id: "t1", amount: -200_00, time: 1_700_000_000 },
      { id: "t2", amount: -100_00, time: 1_700_010_000 }, // новіша
    ];
    const r = getLastTxForSubscription({ linkedTxId: "t1" }, transactions);
    expect(r?.id).toBe("t1");
  });

  it("ігнорує linkedTxId, якщо tx позитивна (надходження)", () => {
    const transactions = [
      { id: "t1", amount: 500_00, time: 1_700_000_000 },
      {
        id: "t2",
        amount: -100_00,
        time: 1_700_010_000,
        description: "Netflix",
      },
    ];
    // linkedTxId вказує на надходження, fallback до keyword
    const r = getLastTxForSubscription(
      { linkedTxId: "t1", keyword: "netflix" },
      transactions,
    );
    expect(r?.id).toBe("t2");
  });

  it("ігнорує linkedTxId, якщо tx не знайдена; падає назад на keyword", () => {
    const transactions = [
      {
        id: "t1",
        amount: -200_00,
        time: 1_700_000_000,
        description: "Spotify monthly",
      },
    ];
    const r = getLastTxForSubscription(
      { linkedTxId: "missing", keyword: "spotify" },
      transactions,
    );
    expect(r?.id).toBe("t1");
  });

  it("повертає null коли немає ні linkedTxId, ні keyword", () => {
    const transactions = [{ id: "t1", amount: -200_00, time: 1_700_000_000 }];
    expect(getLastTxForSubscription({}, transactions)).toBeNull();
  });

  it("trim + lowercase для keyword; ігнорує whitespace-only keyword", () => {
    const transactions = [
      {
        id: "t1",
        amount: -100_00,
        time: 1_700_000_000,
        description: "Netflix UA",
      },
    ];
    expect(
      getLastTxForSubscription({ keyword: "   " }, transactions),
    ).toBeNull();
    expect(
      getLastTxForSubscription({ keyword: "  NETFLIX  " }, transactions)?.id,
    ).toBe("t1");
  });

  it("вибирає найновішу keyword-match серед витратних tx", () => {
    const transactions = [
      {
        id: "old",
        amount: -100_00,
        time: 1_700_000_000,
        description: "Netflix",
      },
      {
        id: "new",
        amount: -100_00,
        time: 1_700_900_000,
        description: "Netflix",
      },
      {
        id: "income",
        amount: 100_00,
        time: 1_701_000_000,
        description: "Netflix refund",
      },
    ];
    const r = getLastTxForSubscription({ keyword: "netflix" }, transactions);
    expect(r?.id).toBe("new");
  });

  it("повертає null, якщо keyword-match не знайдений (всі без description або не збігаються)", () => {
    const transactions = [
      { id: "t1", amount: -100_00, time: 1_700_000_000 },
      {
        id: "t2",
        amount: -50_00,
        time: 1_700_010_000,
        description: "Coffee",
      },
    ];
    expect(
      getLastTxForSubscription({ keyword: "netflix" }, transactions),
    ).toBeNull();
  });

  it("трактує відсутній time як 0 (стабільне сортування)", () => {
    const transactions = [
      { id: "a", amount: -100_00, description: "Netflix" },
      {
        id: "b",
        amount: -100_00,
        time: 1_700_000_000,
        description: "Netflix",
      },
    ];
    // b має time > 0, a — 0 → b "новіша" і вертається першою
    const r = getLastTxForSubscription({ keyword: "netflix" }, transactions);
    expect(r?.id).toBe("b");
  });
});

describe("getSubscriptionAmountMeta", () => {
  it("повертає null amount + '₴' за замовчуванням, коли релевантної tx немає", () => {
    const meta = getSubscriptionAmountMeta({}, []);
    expect(meta).toEqual({ amount: null, currency: "₴", lastTx: null });
  });

  it("повертає null amount + '$' коли sub.currency === 'USD' і tx не знайдена", () => {
    const meta = getSubscriptionAmountMeta({ currency: "USD" }, []);
    expect(meta).toEqual({ amount: null, currency: "$", lastTx: null });
  });

  it("обчислює amount як |tx.amount/100| коли tx знайдена", () => {
    const transactions = [
      {
        id: "t1",
        amount: -349_00,
        time: 1_700_000_000,
        description: "Spotify",
        currencyCode: CURRENCY.UAH as number,
      },
    ];
    const meta = getSubscriptionAmountMeta(
      { keyword: "spotify" },
      transactions,
    );
    expect(meta.amount).toBe(349);
    expect(meta.currency).toBe("₴");
    expect(meta.lastTx?.id).toBe("t1");
  });

  it("повертає '$' коли last tx у USD (currencyCode === CURRENCY.USD)", () => {
    const transactions = [
      {
        id: "t1",
        amount: -1500_00,
        time: 1_700_000_000,
        description: "Netflix",
        currencyCode: CURRENCY.USD as number,
      },
    ];
    const meta = getSubscriptionAmountMeta(
      { keyword: "netflix" },
      transactions,
    );
    expect(meta.amount).toBe(1500);
    expect(meta.currency).toBe("$");
  });
});
