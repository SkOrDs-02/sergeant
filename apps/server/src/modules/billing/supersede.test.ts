import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockEnv = vi.hoisted(() => ({}) as Record<string, any>);
vi.mock("../../env/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../env/env.js")>();
  Object.assign(mockEnv, actual.env);
  return {
    ...actual,
    get env() {
      return mockEnv;
    },
  };
});

import {
  MAX_CANCEL_ATTEMPTS,
  findSupersededRecurrence,
  recordSupersededRecurrence,
  retryPendingCancellations,
  settleSupersededRecurrence,
} from "./supersede.js";

function dbWith(rows: unknown[]) {
  const query = vi.fn(async (sql: string) =>
    sql.includes("FROM subscriptions") ? { rows } : { rows: [], rowCount: 1 },
  );
  return { db: { query } as never, query };
}

const row = (over: Record<string, unknown> = {}) => ({
  provider: "liqpay",
  provider_subscription_id: "order_1",
  cancel_at_period_end: false,
  ...over,
});

describe("findSupersededRecurrence", () => {
  it("null, коли живого рядка нема", async () => {
    const { db } = dbWith([]);
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "plata",
        subscriptionId: "s",
      }),
    ).resolves.toBeNull();
  });

  it("null для manual (reverse trial / гранти): рекурентки нема", async () => {
    const { db } = dbWith([
      row({ provider: "manual", provider_subscription_id: null }),
    ]);
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "plata",
        subscriptionId: "s",
      }),
    ).resolves.toBeNull();
  });

  it("null для рядка без provider_subscription_id", async () => {
    const { db } = dbWith([row({ provider_subscription_id: null })]);
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "plata",
        subscriptionId: "s",
      }),
    ).resolves.toBeNull();
  });

  it("null для того самого провайдера з тим самим id (звичайне поновлення)", async () => {
    const { db } = dbWith([row()]);
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "liqpay",
        subscriptionId: "order_1",
      }),
    ).resolves.toBeNull();
  });

  it("null, коли активація не несе id і провайдер той самий (Stripe checkout без subscription)", async () => {
    const { db } = dbWith([
      row({ provider: "stripe", provider_subscription_id: "sub_1" }),
    ]);
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "stripe",
        subscriptionId: null,
      }),
    ).resolves.toBeNull();
  });

  it("повертає рядок для іншого провайдера і для іншого id того ж провайдера", async () => {
    const { db } = dbWith([row({ cancel_at_period_end: true })]);
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "plata",
        subscriptionId: "s",
      }),
    ).resolves.toEqual({
      provider: "liqpay",
      subscriptionId: "order_1",
      alreadyCanceling: true,
    });
    await expect(
      findSupersededRecurrence(db, "u", {
        provider: "liqpay",
        subscriptionId: "order_2",
      }),
    ).resolves.toMatchObject({ subscriptionId: "order_1" });
  });
});

describe("recordSupersededRecurrence", () => {
  it("Plata: ставить superseded_at і відкриває запис у черзі, повертає що скасувати", async () => {
    const { db, query } = dbWith([]);
    const prev = {
      provider: "plata",
      subscriptionId: "s1",
      alreadyCanceling: false,
    };
    await expect(recordSupersededRecurrence(db, "u", prev)).resolves.toEqual(
      prev,
    );
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls[0]).toContain("superseded_at");
    expect(sqls[1]).toContain("billing_pending_cancellation");
  });

  it("alreadyCanceling: провайдера не смикаємо (null), слід лишається вже resolved", async () => {
    const { db, query } = dbWith([]);
    await expect(
      recordSupersededRecurrence(db, "u", {
        provider: "liqpay",
        subscriptionId: "o1",
        alreadyCanceling: true,
      }),
    ).resolves.toBeNull();
    expect(String(query.mock.calls[0]?.[0])).toContain("resolved_at");
  });
});

describe("settleSupersededRecurrence", () => {
  beforeEach(() => {
    mockEnv["PLATA_TOKEN"] = "tok";
    mockEnv["LIQPAY_PUBLIC_KEY"] = "pub";
    mockEnv["LIQPAY_PRIVATE_KEY"] = "priv";
    mockEnv["STRIPE_SECRET_KEY"] = "sk";
  });
  afterEach(() => vi.unstubAllGlobals());

  /** db: claim -> attempts, інше - ok. Збирає SQL у порядку викликів. */
  function claimDb(attempts: number | null) {
    const query = vi.fn(async (sql: string) =>
      sql.includes("RETURNING attempts")
        ? { rows: attempts === null ? [] : [{ attempts }] }
        : { rows: [], rowCount: 1 },
    );
    const resolved = () =>
      query.mock.calls.some((c) => String(c[0]).includes("SET resolved_at"));
    return { db: { query } as never, query, resolved };
  }

  it("Plata: шле edit/cancel і закриває запис", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { db, resolved } = claimDb(1);
    await settleSupersededRecurrence(db, {
      provider: "plata",
      subscriptionId: "s1",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/subscription/edit",
    );
    expect(resolved()).toBe(true);
  });

  it("відмова провайдера НЕ кидає й лишає запис відкритим для ретраю", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    const { db, resolved } = claimDb(1);
    await expect(
      settleSupersededRecurrence(db, {
        provider: "plata",
        subscriptionId: "s1",
      }),
    ).resolves.toBeUndefined();
    expect(resolved()).toBe(false);
  });

  it("LiqPay order_not_found = підписки вже нема = закрито без помилки", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ result: "error", err_code: "order_not_found" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { db, resolved } = claimDb(1);
    await settleSupersededRecurrence(db, {
      provider: "liqpay",
      subscriptionId: "order_1",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "liqpay.ua/api/request",
    );
    expect(resolved()).toBe(true);
  });

  it("LiqPay: інша бізнес-відмова (result:error) лишає запис відкритим", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ result: "error", err_code: "x" })),
    );
    const { db, resolved } = claimDb(1);
    await settleSupersededRecurrence(db, {
      provider: "liqpay",
      subscriptionId: "order_1",
    });
    expect(resolved()).toBe(false);
  });

  it("Stripe: 404 = підписки вже нема = закрито; без ключа - відкрито", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 404 })),
    );
    const gone = claimDb(1);
    await settleSupersededRecurrence(gone.db, {
      provider: "stripe",
      subscriptionId: "sub_1",
    });
    expect(gone.resolved()).toBe(true);

    mockEnv["STRIPE_SECRET_KEY"] = undefined;
    const noKey = claimDb(1);
    await settleSupersededRecurrence(noKey.db, {
      provider: "stripe",
      subscriptionId: "sub_1",
    });
    expect(noKey.resolved()).toBe(false);
  });

  it("запис уже закрито (claim нічого не повернув) - провайдера не смикаємо", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db } = claimDb(null);
    await settleSupersededRecurrence(db, {
      provider: "plata",
      subscriptionId: "s1",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("остання спроба лунає як abandoned (error-лог), запис лишається відкритим", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    const { db, resolved } = claimDb(MAX_CANCEL_ATTEMPTS);
    await settleSupersededRecurrence(db, {
      provider: "plata",
      subscriptionId: "s1",
    });
    expect(resolved()).toBe(false);
  });
});

describe("retryPendingCancellations", () => {
  it("бере відкриті записи в межах ліміту спроб і пробує кожен", async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes("SELECT provider, provider_subscription_id")) {
        return {
          rows: [
            { provider: "stripe", provider_subscription_id: "sub_1" },
            { provider: "apple", provider_subscription_id: "x" },
          ],
        };
      }
      if (sql.includes("RETURNING attempts"))
        return { rows: [{ attempts: 2 }] };
      return { rows: [], rowCount: 1 };
    });
    const res = await retryPendingCancellations({ query } as never);
    expect(res).toEqual({ processed: 2 });
    const select = query.mock.calls[0];
    expect(String(select?.[0])).toContain("attempts < $1");
    expect(select?.[1]).toEqual([MAX_CANCEL_ATTEMPTS, 30, 20]);
  });
});
