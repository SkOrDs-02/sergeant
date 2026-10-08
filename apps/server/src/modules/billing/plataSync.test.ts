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

  it("slow tick бере лише тих, кого не звіряли понад 24 год (модель «кому вже час», rel-19)", async () => {
    const { pool, calls } = mockPool([
      { match: "JOIN subscriptions", response: { rows: [] } },
    ]);
    await runSlowTick(pool);
    const select = calls.find((c) => c.sql.includes("JOIN subscriptions"));
    expect(select?.sql).toMatch(
      /ps\.updated_at\s*<\s*NOW\(\)\s*-\s*INTERVAL '24 hours'/,
    );
  });
});

/**
 * rel-19: годинний slow tick вирішує «кому вже час» за
 * `plata_subscription.updated_at`, тож кожна УСПІШНА звірка мусить його
 * оновити - незалежно від гілки. Інакше невідомий статус / past_due
 * перезвірялись би щогодини, а без оновлення нічого не виходить із вибірки.
 */
describe("reconcileSubscription - штамп звірки для slow tick (rel-19)", () => {
  // Саме окремий штамп: UPDATE у applyActive (confirmed_at + updated_at) сюди
  // не потрапляє, тож тест не проходить "випадково" на гілці active.
  const stamp = (calls: { sql: string; params: unknown[] | undefined }[]) =>
    calls.filter(
      (c) =>
        c.sql.includes("UPDATE plata_subscription") &&
        c.sql.includes("SET updated_at = NOW()"),
    );

  async function reconcileWith(body: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body))),
    );
    const { pool, calls } = mockPool([]);
    await reconcileSubscription(pool, {
      user_id: "usr_stamp",
      subscription_id: "s2_stamp",
    });
    return calls;
  }

  it("гілка active штампує updated_at", async () => {
    const calls = await reconcileWith({ status: "active" });
    expect(stamp(calls)).toHaveLength(1);
  });

  it("гілка past_due (failureDescription) штампує updated_at", async () => {
    const calls = await reconcileWith({
      status: "active",
      walletData: { failureDescription: "Недостатньо коштів" },
    });
    expect(stamp(calls).map((c) => c.params)).toEqual([["usr_stamp"]]);
  });

  it("невідомий статус штампує updated_at, але subscriptions не чіпає", async () => {
    const calls = await reconcileWith({ status: "weird_new_value" });
    expect(stamp(calls)).toHaveLength(1);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("INSERT INTO subscriptions") ||
          c.sql.includes("UPDATE subscriptions"),
      ),
    ).toBe(false);
  });

  it("неуспішний fetch НЕ штампує: рядок буде перезвірено наступним тіком", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );
    const { pool, calls } = mockPool([]);
    await reconcileSubscription(pool, {
      user_id: "usr_stamp",
      subscription_id: "s2_stamp",
    });
    expect(stamp(calls)).toHaveLength(0);
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

/**
 * rel-19: 24-годинний `setInterval` скидався кожним рестартом (деплоїв кілька
 * на день), тож `runSlowTick` не виконувався ніколи. Тепер slow tick годинний
 * + є одноразовий стартовий тік із затримкою.
 */
describe("PlataSyncPoller - slow tick переживає рестарти (rel-19)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const slowSelects = (calls: { sql: string }[]) =>
    calls.filter(
      (c) =>
        c.sql.includes("JOIN subscriptions") &&
        c.sql.includes("ps.updated_at <"),
    );

  it("slow tick виконується після ~1 год роботи процесу (дефолтні інтервали)", async () => {
    vi.useFakeTimers();
    const { pool, calls } = mockPool([]);
    // startDelayMs: 0 - ізолюємо саме годинний інтервал від стартового тіку.
    const poller = new PlataSyncPoller({
      pool,
      enabled: true,
      startDelayMs: 0,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(59 * 60_000);
    expect(slowSelects(calls)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(slowSelects(calls)).toHaveLength(1);

    await poller.stop();
  });

  it("стартовий тік (< fastTickMs) виконує slow tick одразу після затримки", async () => {
    vi.useFakeTimers();
    const { pool, calls } = mockPool([]);
    const poller = new PlataSyncPoller({
      pool,
      enabled: true,
      startDelayMs: 45_000,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(44_999);
    expect(slowSelects(calls)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(slowSelects(calls)).toHaveLength(1);
    // Fast tick (5 хв) ще не настав - не рахуємо його, лише slow.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(slowSelects(calls)).toHaveLength(1);

    await poller.stop();
  });

  it("stop() до стартового тіку не викликає тік", async () => {
    vi.useFakeTimers();
    const { pool, calls } = mockPool([]);
    const poller = new PlataSyncPoller({
      pool,
      enabled: true,
      startDelayMs: 45_000,
    });

    poller.start();
    await poller.stop();
    await vi.advanceTimersByTimeAsync(2 * 3_600_000);
    expect(calls).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

/**
 * Дунінг на юзері з КІЛЬКОМА plata-рядками (фікс аудиту 2026-09-16).
 * Скасовані рядки нікуди не діваються — частковий унікальний індекс
 * `subscriptions_user_active_idx` стереже лише активний набір. Доти
 * `applyPastDue` брав `rows[0]` без `ORDER BY`/`LIMIT` і оновлював УСІ рядки
 * юзера: або воскрешав скасований у `past_due` (для `getUserPlan` = активний
 * доступ), або штовхав два рядки разом у той індекс → 23505, який
 * `reconcileSubscription` ковтає своїм catch, і дунінг тихо не застосовувався.
 */
describe("applyPastDue — юзер із кількома plata-рядками", () => {
  const ACTIVE_SET = ["active", "trialing", "past_due"];

  interface FakeRow {
    user_id: string;
    provider: string;
    status: string;
    current_period_end: string | null;
    updated_at: number;
  }

  /**
   * Мок, що інтерпретує WHERE/ORDER BY/LIMIT по маленькій таблиці в пам'яті і
   * відтворює частковий унікальний індекс. Без цього тест перевіряв би лише
   * текст SQL, а не наслідок — а наслідок тут і є багом.
   */
  function tablePool(rows: FakeRow[]) {
    const calls: { sql: string; params: unknown[] | undefined }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const userId = params?.[0];
      const scopedToActive = sql.includes(
        "status IN ('active', 'trialing', 'past_due')",
      );
      const matches = (r: FakeRow) =>
        r.user_id === userId &&
        r.provider === "plata" &&
        (!scopedToActive || ACTIVE_SET.includes(r.status));

      if (sql.includes("SELECT current_period_end")) {
        let hits = rows.filter(matches);
        if (sql.includes("ORDER BY updated_at DESC")) {
          hits = [...hits].sort((a, b) => b.updated_at - a.updated_at);
        }
        if (sql.includes("LIMIT 1")) hits = hits.slice(0, 1);
        return {
          rows: hits.map((r) => ({ current_period_end: r.current_period_end })),
        };
      }

      if (sql.includes("UPDATE subscriptions")) {
        const hits = rows.filter(matches);
        // Частковий унікальний індекс перевіряється до застосування —
        // statement або проходить цілком, або не змінює нічого.
        const afterActive = rows.filter((r) =>
          hits.includes(r) ? true : ACTIVE_SET.includes(r.status),
        );
        if (afterActive.length > 1) {
          const err = new Error(
            'duplicate key value violates unique constraint "subscriptions_user_active_idx"',
          ) as Error & { code?: string };
          err.code = "23505";
          throw err;
        }
        for (const r of hits) {
          r.status = "past_due";
          if (sql.includes("current_period_end = $2")) {
            r.current_period_end = (params?.[1] as Date).toISOString();
          }
        }
        return { rows: [] };
      }

      return { rows: [] };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { pool: { query } as any, calls, rows };
  }

  function stubFailureFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            subscriptionId: "s2_multi",
            status: "active",
            walletData: { failureDescription: "Недостатньо коштів" },
          }),
        ),
      ),
    );
  }

  it("переводить у past_due лише активний рядок і не чіпає скасований", async () => {
    stubFailureFetch();
    const canceled: FakeRow = {
      user_id: "usr_multi",
      provider: "plata",
      status: "canceled",
      current_period_end: null,
      updated_at: 1,
    };
    const active: FakeRow = {
      user_id: "usr_multi",
      provider: "plata",
      status: "active",
      current_period_end: null,
      updated_at: 2,
    };
    const { pool } = tablePool([canceled, active]);

    await reconcileSubscription(pool, {
      user_id: "usr_multi",
      subscription_id: "s2_multi",
    });

    expect(active.status).toBe("past_due");
    // Скасований рядок не «воскресає» — для getUserPlan це був би Pro-доступ.
    expect(canceled.status).toBe("canceled");
    expect(canceled.current_period_end).toBeNull();
  });

  it("читає грейс із рядка, що тримає ентайтлмент, а не з першого-ліпшого", async () => {
    stubFailureFetch();
    // Скасований рядок має грейс у майбутньому і СТАРШИЙ updated_at —
    // без фільтра і ORDER BY саме він приїжджав у rows[0].
    const canceled: FakeRow = {
      user_id: "usr_pick",
      provider: "plata",
      status: "canceled",
      current_period_end: new Date(
        Date.now() + 10 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      updated_at: 5,
    };
    const active: FakeRow = {
      user_id: "usr_pick",
      provider: "plata",
      status: "active",
      current_period_end: null,
      updated_at: 1,
    };
    const { pool, calls } = tablePool([canceled, active]);

    const before = Date.now();
    await reconcileSubscription(pool, {
      user_id: "usr_pick",
      subscription_id: "s2_multi",
    });

    // Грейс відкривається вперше → зсув дати має статись.
    const shift = calls.find(
      (c) =>
        c.sql.includes("UPDATE subscriptions") &&
        c.sql.includes("current_period_end = $2"),
    );
    expect(shift).toBeDefined();
    expect(active.status).toBe("past_due");
    const graceMs = new Date(active.current_period_end!).getTime() - before;
    expect(graceMs).toBeGreaterThan(2.9 * 24 * 60 * 60 * 1000);
    expect(graceMs).toBeLessThan(3.1 * 24 * 60 * 60 * 1000);
  });

  it("SELECT звужений до активного набору з ORDER BY/LIMIT, обидва UPDATE — теж", async () => {
    stubFailureFetch();
    const { pool, calls } = tablePool([
      {
        user_id: "usr_sql",
        provider: "plata",
        status: "active",
        current_period_end: null,
        updated_at: 1,
      },
    ]);
    await reconcileSubscription(pool, {
      user_id: "usr_sql",
      subscription_id: "s2_multi",
    });

    const select = calls.find((c) =>
      c.sql.includes("SELECT current_period_end"),
    );
    expect(select?.sql).toContain(
      "status IN ('active', 'trialing', 'past_due')",
    );
    expect(select?.sql).toContain("ORDER BY updated_at DESC");
    expect(select?.sql).toContain("LIMIT 1");
    for (const c of calls.filter((x) =>
      x.sql.includes("UPDATE subscriptions"),
    )) {
      expect(c.sql).toContain("status IN ('active', 'trialing', 'past_due')");
    }
  });
});
