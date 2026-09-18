import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { captureMessageMock, getRedisMock, redisSetMock, queryMock } =
  vi.hoisted(() => ({
    captureMessageMock: vi.fn(),
    getRedisMock: vi.fn(),
    redisSetMock: vi.fn(),
    queryMock: vi.fn(),
  }));
vi.mock("../sentry.js", () => ({
  Sentry: { captureMessage: captureMessageMock },
}));
vi.mock("../lib/redis.js", () => ({
  getRedis: getRedisMock,
}));
vi.mock("../db.js", () => ({
  default: { query: queryMock },
}));

import {
  AnthropicBudgetGuard,
  isAnthropicBudgetHardExceeded,
  readSpendFromLedger,
  type AnthropicBudgetRedisClient,
  type AnthropicBudgetCaptureInput,
} from "./anthropicBudgetGuard.js";

/**
 * Витрата за добою. Раніше тести інкрементили Prometheus-лічильник —
 * саме те джерело, яке гвард більше не читає (воно не переживало рестарт,
 * див. шапку модуля). Тепер підставляємо `readSpendUsd` напряму: предмет
 * цих тестів — пороги й ідемпотентність, а не SQL. Сам SQL перевіряється
 * окремим describe-блоком нижче.
 */
let spendByDay: Map<string, number>;
let defaultSpend: number;

/** Додати витрату «на сьогодні» — для тестів, яким байдужа конкретна доба. */
function recordSpend(spend: number, _model = "claude-3-5-haiku"): void {
  defaultSpend += spend;
}

/** Додати витрату на конкретну київську добу (для rollover-тестів). */
function recordSpendOn(day: string, spend: number): void {
  spendByDay.set(day, (spendByDay.get(day) ?? 0) + spend);
}

function createGuard(opts?: {
  now?: () => number;
  capture?: (input: AnthropicBudgetCaptureInput) => void;
  redis?: AnthropicBudgetRedisClient | null;
  monthlyBudgetUsd?: () => number;
  readSpendUsd?: (day: string) => Promise<number>;
}): AnthropicBudgetGuard {
  return new AnthropicBudgetGuard({
    readSpendUsd: (day) => Promise.resolve(spendByDay.get(day) ?? defaultSpend),
    ...opts,
  });
}

beforeEach(() => {
  spendByDay = new Map();
  defaultSpend = 0;
  captureMessageMock.mockClear();
  getRedisMock.mockReset();
  getRedisMock.mockReturnValue(null);
  redisSetMock.mockReset();
  queryMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AnthropicBudgetGuard — thresholds", () => {
  it("does not fire when spend < soft", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(1.5);
    const result = await guard.runBudgetCheckTick();
    expect(result.softFired).toBe(false);
    expect(result.hardFired).toBe(false);
    expect(captures).toHaveLength(0);
    expect(result.spendUsd).toBeCloseTo(1.5, 5);
  });

  it("fires SOFT (warning) when spend ≥ soft but < hard", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(3.25);
    const result = await guard.runBudgetCheckTick();
    expect(result.softFired).toBe(true);
    expect(result.hardFired).toBe(false);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.threshold).toBe("soft");
    expect(captures[0]?.spendUsd).toBeCloseTo(3.25, 5);
    expect(captures[0]?.thresholdUsd).toBe(3);
    expect(guard.isHardBreached()).toBe(false);
  });

  it("fires HARD (error) when spend ≥ hard, NOT soft (deduped)", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(5.5);
    const result = await guard.runBudgetCheckTick();
    expect(result.softFired).toBe(false);
    expect(result.hardFired).toBe(true);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.threshold).toBe("hard");
    expect(captures[0]?.spendUsd).toBeCloseTo(5.5, 5);
    expect(captures[0]?.thresholdUsd).toBe(5);
    expect(guard.isHardBreached()).toBe(true);
  });

  it("sums spend across multiple model/endpoint rows", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(1.5, "claude-3-5-haiku");
    recordSpend(1.0, "claude-3-5-sonnet");
    recordSpend(0.75, "claude-3-5-haiku");
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBeCloseTo(3.25, 5);
    expect(result.softFired).toBe(true);
  });
});

describe("AnthropicBudgetGuard - production wiring", () => {
  it("starts and stops the interval loop idempotently", () => {
    vi.useFakeTimers();
    const guard = createGuard({ redis: null });

    guard.start();
    guard.start();
    expect(vi.getTimerCount()).toBe(1);

    guard.stop();
    guard.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the default Sentry capture for hard alerts", async () => {
    const guard = createGuard({ redis: null });

    recordSpend(5.5);
    const result = await guard.runBudgetCheckTick();

    expect(result.hardFired).toBe(true);
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("anthropic_budget_hard_alert"),
      expect.objectContaining({
        level: "error",
        tags: expect.objectContaining({
          module: "obs",
          op: "anthropic_budget_alert",
          threshold: "hard",
          provider: "anthropic",
        }),
        extra: expect.objectContaining({
          spendUsd: 5.5,
          thresholdUsd: 5,
        }),
      }),
    );
  });

  it("keeps default capture fail-open when Sentry throws", async () => {
    captureMessageMock.mockImplementationOnce(() => {
      throw new Error("sentry unavailable");
    });
    const guard = createGuard({ redis: null });

    recordSpend(3.5);

    await expect(guard.runBudgetCheckTick()).resolves.toMatchObject({
      softFired: true,
    });
  });

  it("uses getRedis() when no Redis override is provided", async () => {
    redisSetMock.mockResolvedValue("OK");
    getRedisMock.mockReturnValue({ set: redisSetMock });
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
    });

    recordSpend(3.5);
    const result = await guard.runBudgetCheckTick();

    expect(result.softFired).toBe(true);
    expect(captures).toHaveLength(1);
    expect(getRedisMock).toHaveBeenCalled();
    expect(redisSetMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /^anthropic_budget_alert_v1:\d{4}-\d{2}-\d{2}:soft$/,
      ),
      "1",
      "EX",
      36 * 60 * 60,
      "NX",
    );
  });

  it("exposes the production singleton hard-breach helper", () => {
    expect(isAnthropicBudgetHardExceeded()).toBe(false);
  });
});

describe("AnthropicBudgetGuard — idempotency", () => {
  it("fires SOFT only once per day (in-memory fallback)", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(3.5);
    await guard.runBudgetCheckTick();
    await guard.runBudgetCheckTick();
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);
  });

  it("fires HARD only once per day (in-memory fallback)", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(5.5);
    await guard.runBudgetCheckTick();
    recordSpend(2);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);
    expect(captures[0]?.threshold).toBe("hard");
    expect(guard.isHardBreached()).toBe(true);
  });

  it("does NOT fire SOFT after HARD already fired same day", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(5.2);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);
    expect(captures[0]?.threshold).toBe("hard");

    // Ще трохи витрати на тій самій добі — soft НЕ повинен послатися
    // другим event-ом: день уже позначений як hard, і soft-прапорець
    // виставлений разом із ним саме як дедупер.
    recordSpend(0.1);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);
  });

  it("respects Redis-backed idempotency (SET NX EX)", async () => {
    const setMock = vi.fn(
      async (
        _key: string,
        _value: string,
        _mode: "EX",
        _ttl: number,
        _nx: "NX",
      ): Promise<"OK" | null> => "OK",
    );
    const fakeRedis: AnthropicBudgetRedisClient = { set: setMock };

    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: fakeRedis,
    });
    recordSpend(3.5);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);
    expect(setMock).toHaveBeenCalled();
    const firstCall = setMock.mock.calls[0];
    expect(firstCall?.[0]).toMatch(
      /^anthropic_budget_alert_v1:\d{4}-\d{2}-\d{2}:soft$/,
    );
    expect(firstCall?.[1]).toBe("1");
    expect(firstCall?.[2]).toBe("EX");
    expect(firstCall?.[3]).toBe(36 * 60 * 60);
    expect(firstCall?.[4]).toBe("NX");
  });

  it("skips firing when Redis SET NX returns null (other pod already alerted)", async () => {
    const setMock = vi.fn(
      async (
        _key: string,
        _value: string,
        _mode: "EX",
        _ttl: number,
        _nx: "NX",
      ): Promise<"OK" | null> => null,
    );
    const fakeRedis: AnthropicBudgetRedisClient = { set: setMock };

    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: fakeRedis,
    });
    recordSpend(3.5);
    const result = await guard.runBudgetCheckTick();
    expect(result.softFired).toBe(false);
    expect(captures).toHaveLength(0);
  });
});

describe("AnthropicBudgetGuard — fail-open", () => {
  it("survives Redis SET throwing — falls back to in-memory + still fires", async () => {
    const fakeRedis: AnthropicBudgetRedisClient = {
      set: vi.fn(async () => {
        throw new Error("redis_down");
      }),
    };
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: fakeRedis,
    });
    recordSpend(3.5);
    const result = await guard.runBudgetCheckTick();
    expect(result.softFired).toBe(true);
    expect(captures).toHaveLength(1);
  });

  it("survives Sentry capture throwing — does NOT propagate", async () => {
    const guard = createGuard({
      capture: () => {
        throw new Error("sentry_down");
      },
      redis: null,
    });
    recordSpend(3.5);
    // Не повинно кинути.
    await expect(guard.runBudgetCheckTick()).resolves.toBeDefined();
  });

  it("падіння самого пулу не дає ані алерту, ані винятку", async () => {
    // Раніше тут глушився prom-client; тепер джерело — Postgres, і
    // сценарій той самий: читання кидає, гвард має віддати 0 spend і
    // мовчати, а не false-positive-нути hard alert.
    queryMock.mockRejectedValue(new Error("db down"));
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = new AnthropicBudgetGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBe(0);
    expect(result.softFired).toBe(false);
    expect(result.hardFired).toBe(false);
    expect(captures).toHaveLength(0);
  });

  it("isHardBreached() defaults to false", () => {
    const guard = createGuard({ redis: null });
    expect(guard.isHardBreached()).toBe(false);
  });
});

describe("AnthropicBudgetGuard — day rollover", () => {
  it("resets flags + hardBreached on day change", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    let mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpendOn("2026-05-13", 5.5);
    await guard.runBudgetCheckTick();
    expect(guard.isHardBreached()).toBe(true);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.day).toBe("2026-05-13");

    // Нова доба — гвард питає леджер уже за неї, і там поки порожньо.
    // Раніше цю нульову базу давав re-anchor лічильника; тепер вона
    // просто випливає з ключа запиту, і рестарт процесу її не міняє.
    mockNow = new Date("2026-05-14T00:01:00Z").getTime();
    const result = await guard.runBudgetCheckTick();
    expect(result.day).toBe("2026-05-14");
    expect(result.spendUsd).toBe(0);
    expect(result.softFired).toBe(false);
    expect(result.hardFired).toBe(false);
    expect(guard.isHardBreached()).toBe(false);
    expect(captures).toHaveLength(1);
  });

  it("fires again on the next day when threshold re-breached", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    let mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpendOn("2026-05-13", 3.5);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);

    mockNow = new Date("2026-05-14T00:01:00Z").getTime();
    // Rollover на новий день. Spend сьогодні поки що 0.
    await guard.runBudgetCheckTick();

    // $4 уже на новій добі — soft має fire-нутись знову.
    recordSpendOn("2026-05-14", 4);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(2);
    expect(captures[1]?.threshold).toBe("soft");
    expect(captures[1]?.day).toBe("2026-05-14");
  });
});

describe("AnthropicBudgetGuard — витрата переживає рестарт процесу", () => {
  it("свіжий інстанс бачить уже витрачене за добу, а не нуль", async () => {
    // Це і є та регресія, заради якої джерело змінили. Новий
    // `AnthropicBudgetGuard` — точна модель рестарту: стан порожній,
    // прапорці зняті. Поки витрата бралася з лічильника в памʼяті, тут
    // був би нуль, і денна стеля починалась би заново з кожного деплою.
    const captures: AnthropicBudgetCaptureInput[] = [];
    recordSpend(12);

    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    const result = await guard.runBudgetCheckTick();

    expect(result.spendUsd).toBeCloseTo(12, 5);
    expect(result.hardFired).toBe(true);
    expect(guard.isHardBreached()).toBe(true);
  });

  it("відʼємна сума з леджера затискається в нуль і не знімає breach", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
      readSpendUsd: () => Promise.resolve(-5),
    });
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBe(0);
    expect(captures).toHaveLength(0);
  });

  it("збій читання леджера не алертить і не валить тік", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
      readSpendUsd: () => Promise.reject(new Error("db down")),
    });
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBe(0);
    expect(result.hardFired).toBe(false);
    expect(captures).toHaveLength(0);
  });
});

describe("readSpendFromLedger — сам запит", () => {
  it("фільтрує по provider-рядку й переданій добі", async () => {
    queryMock.mockResolvedValue({ rows: [{ usd: "7.25" }] });
    const usd = await readSpendFromLedger("2026-05-13");

    expect(usd).toBeCloseTo(7.25, 5);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("ai_usage_daily");
    // Фільтр по subject_key — те, що раніше робив лейбл `provider` у
    // лічильнику: без нього в суму потрапили б per-user рядки й подвоїли
    // б витрату.
    expect(params[0]).toBe("provider:anthropic");
    expect(params[1]).toBe("2026-05-13");
  });

  it("порожня доба — нуль, а не NaN", async () => {
    queryMock.mockResolvedValue({ rows: [{ usd: null }] });
    expect(await readSpendFromLedger("2026-05-13")).toBe(0);
  });

  it("NUMERIC приходить рядком — приводимо до числа", async () => {
    // `pg` віддає NUMERIC як string. Без приведення `"12.5" >= 15`
    // порівнювало б рядки й мовчки не спрацьовувало б.
    queryMock.mockResolvedValue({ rows: [{ usd: "12.5" }] });
    const usd = await readSpendFromLedger("2026-05-13");
    expect(typeof usd).toBe("number");
    expect(usd).toBeCloseTo(12.5, 5);
  });
});

describe("AnthropicBudgetGuard — monthly projection", () => {
  it("does not fire when envelope is 0 (disabled)", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (i) => captures.push(i),
      redis: null,
      monthlyBudgetUsd: () => 0,
    });
    recordSpend(2); // below soft → no daily alert either
    const r = await guard.runBudgetCheckTick();
    expect(r.monthlyFired).toBe(false);
    expect(captures).toHaveLength(0);
  });

  it("fires when today × days-in-month ≥ envelope", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    // 2026-05 has 31 days. today $2 × 31 = $62 ≥ $50 envelope.
    const mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (i) => captures.push(i),
      redis: null,
      monthlyBudgetUsd: () => 50,
    });
    recordSpend(2);
    const r = await guard.runBudgetCheckTick();
    expect(r.monthlyFired).toBe(true);
    const monthly = captures.find((c) => c.threshold === "monthly");
    expect(monthly).toBeDefined();
    expect(monthly?.day).toBe("2026-05");
    expect(monthly?.projectedUsd).toBeCloseTo(62, 5);
    expect(monthly?.thresholdUsd).toBe(50);
  });

  it("does not fire when projection stays under envelope", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (i) => captures.push(i),
      redis: null,
      monthlyBudgetUsd: () => 200, // $2 × 31 = $62 < $200
    });
    recordSpend(2);
    const r = await guard.runBudgetCheckTick();
    expect(r.monthlyFired).toBe(false);
    expect(captures.find((c) => c.threshold === "monthly")).toBeUndefined();
  });

  it("fires once per month — idempotent across same-day ticks", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (i) => captures.push(i),
      redis: null,
      monthlyBudgetUsd: () => 50,
    });
    recordSpend(2);
    await guard.runBudgetCheckTick();
    await guard.runBudgetCheckTick();
    expect(captures.filter((c) => c.threshold === "monthly")).toHaveLength(1);
  });

  it("uses a month-scoped Redis TTL for monthly (not the 36h daily TTL)", async () => {
    const calls: { key: string; ttl: number }[] = [];
    const redis = {
      set: async (
        key: string,
        _v: string,
        _m: "EX",
        ttl: number,
        _nx: "NX",
      ): Promise<"OK" | null> => {
        calls.push({ key, ttl });
        return "OK";
      },
    };
    // 2026-05-13T12:00Z. Hard ($5) + monthly ($50) both breach at spend $5.5.
    const mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      redis,
      capture: () => {},
      monthlyBudgetUsd: () => 50,
    });
    recordSpend(5.5);
    await guard.runBudgetCheckTick();

    const THIRTY_SIX_H = 36 * 60 * 60;
    const monthly = calls.find((c) => c.key.endsWith(":monthly"));
    const daily = calls.find(
      (c) => c.key.endsWith(":hard") || c.key.endsWith(":soft"),
    );
    expect(monthly).toBeDefined();
    expect(daily).toBeDefined();
    // Daily stays at the fixed 36h TTL…
    expect(daily?.ttl).toBe(THIRTY_SIX_H);
    // …monthly spans the rest of the month (~18.5 days) + 36h buffer, so it
    // survives a mid-month restart/other-pod without re-firing.
    expect(monthly?.ttl).toBeGreaterThan(15 * 24 * 60 * 60);
  });

  it("does not re-fire after a day rollover within the same month", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    let mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (i) => captures.push(i),
      redis: null,
      monthlyBudgetUsd: () => 50,
    });
    recordSpendOn("2026-05-13", 2);
    await guard.runBudgetCheckTick();
    expect(captures.filter((c) => c.threshold === "monthly")).toHaveLength(1);

    // Наступна доба, той самий травень → monthly-прапорець має пережити
    // rollover.
    mockNow = new Date("2026-05-14T00:01:00Z").getTime();
    recordSpendOn("2026-05-14", 2); // свіжа витрата, проєкція знову пробила б
    await guard.runBudgetCheckTick();
    expect(captures.filter((c) => c.threshold === "monthly")).toHaveLength(1);
  });
});
