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
  cancelSupersededRecurrence,
  findSupersededRecurrence,
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

describe("cancelSupersededRecurrence", () => {
  beforeEach(() => {
    mockEnv["PLATA_TOKEN"] = "tok";
    mockEnv["LIQPAY_PUBLIC_KEY"] = "pub";
    mockEnv["LIQPAY_PRIVATE_KEY"] = "priv";
    mockEnv["STRIPE_SECRET_KEY"] = "sk";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("Plata: шле edit/cancel і ставить superseded_at", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { db, query } = dbWith([]);
    await cancelSupersededRecurrence(db, {
      provider: "plata",
      subscriptionId: "s1",
      alreadyCanceling: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/subscription/edit",
    );
    expect(String(query.mock.calls[0]?.[0])).toContain("superseded_at");
  });

  it("не смикає провайдера, коли скасування вже підтверджене, але мітить Plata", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { db, query } = dbWith([]);
    await cancelSupersededRecurrence(db, {
      provider: "plata",
      subscriptionId: "s1",
      alreadyCanceling: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(String(query.mock.calls[0]?.[0])).toContain("superseded_at");
  });

  it("відмова провайдера = throw, мітка superseded_at НЕ ставиться", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );
    const { db, query } = dbWith([]);
    await expect(
      cancelSupersededRecurrence(db, {
        provider: "plata",
        subscriptionId: "s1",
        alreadyCanceling: false,
      }),
    ).rejects.toThrow(/HTTP 500/);
    expect(query).not.toHaveBeenCalled();
  });

  it("LiqPay: unsubscribe за order_id; відмова result:error = throw", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ result: "error", err_code: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    const { db } = dbWith([]);
    await expect(
      cancelSupersededRecurrence(db, {
        provider: "liqpay",
        subscriptionId: "order_1",
        alreadyCanceling: false,
      }),
    ).rejects.toThrow(/LiqPay unsubscribe rejected/);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "liqpay.ua/api/request",
    );
  });

  it("Stripe: cancel_at_period_end за subscription id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { db } = dbWith([]);
    await cancelSupersededRecurrence(db, {
      provider: "stripe",
      subscriptionId: "sub_1",
      alreadyCanceling: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/subscriptions/sub_1",
    );
  });
});
