import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../env/env.js", () => ({
  env: { PLATA_TOKEN: "test-merchant-token", PLATA_ENABLED: true },
}));

import {
  PlataSyncPoller,
  reconcileBySubscriptionId,
  reconcileSubscription,
  runFastTick,
  runSlowTick,
} from "./plataSync.js";

/** Routes canned query responses by matching a substring of the SQL. */
function mockPool(routes: { match: string; response: { rows: unknown[] } }[]) {
  const calls: { sql: string; params: unknown[] | undefined }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    const route = routes.find((r) => sql.includes(r.match));
    return route ? route.response : { rows: [] };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { pool: { query } as any, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reconcileSubscription — subscription/status is the arbiter", () => {
  it("status=active activates the subscription with current_period_end = nextChargeDate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_1",
            status: "active",
            nextChargeDate: "2026-10-01T00:00:00.000Z",
            summary: { totalPaid: 2, totalFailed: 0 },
          }),
        ),
      ),
    );
    const { pool, calls } = mockPool([]);

    await reconcileSubscription(pool, {
      user_id: "usr_1",
      subscription_id: "s2_1",
    });

    const upsert = calls.find((c) =>
      c.sql.includes("INSERT INTO subscriptions"),
    );
    expect(upsert).toBeDefined();
    expect(upsert?.params).toEqual([
      "usr_1",
      "s2_1",
      new Date("2026-10-01T00:00:00.000Z"),
    ]);
    const confirm = calls.find((c) =>
      c.sql.includes("UPDATE plata_subscription"),
    );
    expect(confirm).toBeDefined();
  });

  it("a failureDescription in walletData marks past_due with a fresh 3-day grace", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_2",
            status: "active",
            summary: { totalPaid: 1, totalFailed: 1 },
            walletData: { failureDescription: "Недостатньо коштів" },
          }),
        ),
      ),
    );
    // No prior current_period_end (or already-past) → the read returns null.
    const { pool, calls } = mockPool([
      { match: "SELECT current_period_end", response: { rows: [] } },
    ]);

    const before = Date.now();
    await reconcileSubscription(pool, {
      user_id: "usr_2",
      subscription_id: "s2_2",
    });

    const shift = calls.find(
      (c) =>
        c.sql.includes("UPDATE subscriptions") &&
        c.sql.includes("current_period_end = $2"),
    );
    expect(shift).toBeDefined();
    const params = shift?.params as [string, Date];
    expect(params[0]).toBe("usr_2");
    const graceMs = params[1].getTime() - before;
    expect(graceMs).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(graceMs).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
  });

  it("a second past_due tick does NOT shift the date again when the grace window is still open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_3",
            status: "active",
            walletData: { failureDescription: "Недостатньо коштів" },
          }),
        ),
      ),
    );
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const { pool, calls } = mockPool([
      {
        match: "SELECT current_period_end",
        response: { rows: [{ current_period_end: future }] },
      },
    ]);

    await reconcileSubscription(pool, {
      user_id: "usr_3",
      subscription_id: "s2_3",
    });

    const dateShiftingUpdate = calls.find(
      (c) =>
        c.sql.includes("UPDATE subscriptions") &&
        c.sql.includes("current_period_end = $2"),
    );
    expect(dateShiftingUpdate).toBeUndefined();
    const statusOnlyUpdate = calls.find(
      (c) =>
        c.sql.includes("UPDATE subscriptions") &&
        c.sql.includes("status = 'past_due'"),
    );
    expect(statusOnlyUpdate).toBeDefined();
  });

  it("an unrecognized status value does not throw and leaves subscriptions untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_4",
            status: "weird_new_value",
          }),
        ),
      ),
    );
    const { pool, calls } = mockPool([]);

    await expect(
      reconcileSubscription(pool, {
        user_id: "usr_4",
        subscription_id: "s2_4",
      }),
    ).resolves.toBeUndefined();

    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO subscriptions") ||
          c.sql.includes("UPDATE subscriptions"),
      ),
    ).toBe(false);
  });

  it("never logs the merchant token or the wallet cardToken (Hard Rule #21)", async () => {
    const { logger } = await import("../../obs/logger.js");
    const warnSpy = vi.spyOn(logger, "warn");
    const errorSpy = vi.spyOn(logger, "error");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_5",
            status: "active",
            walletData: { cardToken: "super-secret-card-token" },
          }),
        ),
      ),
    );
    const { pool } = mockPool([]);

    await reconcileSubscription(pool, {
      user_id: "usr_5",
      subscription_id: "s2_5",
    });

    const allLoggedText = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .map((args) => JSON.stringify(args))
      .join("\n");
    expect(allLoggedText).not.toContain("super-secret-card-token");
    expect(allLoggedText).not.toContain("test-merchant-token");
  });
});

describe("reconcileBySubscriptionId — webhook trigger", () => {
  it("looks up the user by subscriptionId and reconciles", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ subscriptionId: "s2_6", status: "active" }),
          ),
        ),
    );
    const { pool, calls } = mockPool([
      {
        match: "SELECT user_id FROM plata_subscription",
        response: { rows: [{ user_id: "usr_6" }] },
      },
    ]);

    await reconcileBySubscriptionId(pool, "s2_6");

    expect(calls.some((c) => c.sql.includes("INSERT INTO subscriptions"))).toBe(
      true,
    );
  });

  it("is a no-op when the subscriptionId is unknown", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { pool } = mockPool([
      {
        match: "SELECT user_id FROM plata_subscription",
        response: { rows: [] },
      },
    ]);

    await reconcileBySubscriptionId(pool, "s2_unknown");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runFastTick / runSlowTick — query shape", () => {
  it("fast tick selects unconfirmed rows younger than an hour", async () => {
    const { pool, calls } = mockPool([
      { match: "FROM plata_subscription", response: { rows: [] } },
    ]);
    const result = await runFastTick(pool);
    expect(result).toEqual({ processed: 0 });
    const select = calls.find((c) => c.sql.includes("confirmed_at IS NULL"));
    expect(select).toBeDefined();
    expect(select?.sql).toContain("created_at >");
  });

  it("slow tick selects active/past_due Plata subscriptions", async () => {
    const { pool, calls } = mockPool([
      { match: "JOIN subscriptions", response: { rows: [] } },
    ]);
    const result = await runSlowTick(pool);
    expect(result).toEqual({ processed: 0 });
    const select = calls.find((c) => c.sql.includes("JOIN subscriptions"));
    expect(select?.sql).toContain("'active', 'past_due'");
  });
});

describe("PlataSyncPoller", () => {
  it("start() is a no-op when disabled", () => {
    const { pool, calls } = mockPool([]);
    new PlataSyncPoller({
      pool,
      enabled: false,
      fastTickMs: 1,
      slowTickMs: 1,
    }).start();
    expect(calls).toEqual([]);
  });

  it("start/stop is idempotent and stop() waits out an in-flight tick", async () => {
    let resolveFetch: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = () =>
              resolve(
                new Response(
                  JSON.stringify({ subscriptionId: "s2_x", status: "active" }),
                ),
              );
          }),
      ),
    );
    const { pool } = mockPool([
      {
        match: "confirmed_at IS NULL",
        response: { rows: [{ user_id: "usr_x", subscription_id: "s2_x" }] },
      },
    ]);
    const poller = new PlataSyncPoller({
      pool,
      enabled: true,
      fastTickMs: 5,
      slowTickMs: 60_000,
    });

    poller.start();
    poller.start(); // idempotent — no second pair of timers
    const runPromise = poller.runFast();
    await vi.waitFor(() => expect(resolveFetch).toBeDefined());
    const stopPromise = poller.stop();
    resolveFetch?.();
    await runPromise;
    await stopPromise;
  });
});
