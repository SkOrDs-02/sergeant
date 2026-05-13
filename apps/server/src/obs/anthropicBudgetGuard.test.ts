import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));
vi.mock("../sentry.js", () => ({
  Sentry: { captureMessage: captureMessageMock },
}));

import {
  AnthropicBudgetGuard,
  type AnthropicBudgetRedisClient,
  type AnthropicBudgetCaptureInput,
} from "./anthropicBudgetGuard.js";
import { aiCostEstimateUsd } from "./metrics.js";

function recordSpend(spend: number, model = "claude-3-5-haiku"): void {
  aiCostEstimateUsd.inc(
    { provider: "anthropic", model, endpoint: "chat" },
    spend,
  );
}

function recordOtherProviderSpend(spend: number): void {
  // Counter інкрементується для іншого provider-а — guard має його ігнорувати.
  aiCostEstimateUsd.inc(
    { provider: "voyage", model: "voyage-3.5", endpoint: "embed" },
    spend,
  );
}

function createGuard(opts?: {
  now?: () => number;
  capture?: (input: AnthropicBudgetCaptureInput) => void;
  redis?: AnthropicBudgetRedisClient | null;
}): AnthropicBudgetGuard {
  return new AnthropicBudgetGuard(opts);
}

beforeEach(() => {
  // Скидаємо counter ПЕРЕД instantiate-ом, щоб baseline-snapshot стартував з 0.
  aiCostEstimateUsd.reset();
  captureMessageMock.mockClear();
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

  it("ignores spend on other providers (e.g. voyage)", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordOtherProviderSpend(10);
    recordSpend(0.5);
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBeCloseTo(0.5, 5);
    expect(result.softFired).toBe(false);
    expect(result.hardFired).toBe(false);
    expect(captures).toHaveLength(0);
  });

  it("sums spend across multiple model/endpoint labels", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(1.5, "claude-3-5-haiku");
    recordSpend(1.0, "claude-3-5-sonnet");
    aiCostEstimateUsd.inc(
      { provider: "anthropic", model: "claude-3-5-haiku", endpoint: "coach" },
      0.75,
    );
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBeCloseTo(3.25, 5);
    expect(result.softFired).toBe(true);
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

    // Spend дрейфує вниз нижче hard-у але вище soft-у. Soft НЕ повинен
    // спрацювати — день вже flagged як hard.
    aiCostEstimateUsd.reset();
    recordSpend(3.5);
    const guard2 = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    // Це окремий guard, але семантично: попередня перевірка проходить
    // через ту саму in-memory firedAlerts — тому свіжий guard почне з 0.
    // Перевіряємо через ОДИН guard, що порядок threshold-firing-у правильний.
    void guard2;

    // Інше: на тому ж guard додатково підкрутимо spend і викличемо tick —
    // soft не повинен послатися другим event-ом (hard уже flagged + soft
    // flag виставлений як deduper).
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

  it("returns zero spend on counter read failure (no false alert)", async () => {
    // Спеціально мокаємо `aiCostEstimateUsd.get` щоб imitate-ити збій
    // prom-client-у. Якщо counter API кидає — guard має повернути 0 spend,
    // а не false-positive-нути hard alert.
    const original = aiCostEstimateUsd.get.bind(aiCostEstimateUsd);
    aiCostEstimateUsd.get = vi.fn(() => {
      throw new Error("prom_client_down");
    }) as unknown as typeof aiCostEstimateUsd.get;
    try {
      const captures: AnthropicBudgetCaptureInput[] = [];
      const guard = createGuard({
        capture: (input) => {
          captures.push(input);
        },
        redis: null,
      });
      recordSpend(10);
      const result = await guard.runBudgetCheckTick();
      expect(result.spendUsd).toBe(0);
      expect(result.softFired).toBe(false);
      expect(result.hardFired).toBe(false);
      expect(captures).toHaveLength(0);
    } finally {
      aiCostEstimateUsd.get = original;
    }
  });

  it("isHardBreached() defaults to false", () => {
    const guard = createGuard({ redis: null });
    expect(guard.isHardBreached()).toBe(false);
  });
});

describe("AnthropicBudgetGuard — day rollover", () => {
  it("resets baseline + flags + hardBreached on UTC day change", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    let mockNow = new Date("2026-05-13T12:00:00Z").getTime();
    const guard = createGuard({
      now: () => mockNow,
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(5.5);
    await guard.runBudgetCheckTick();
    expect(guard.isHardBreached()).toBe(true);
    expect(captures).toHaveLength(1);
    expect(captures[0]?.day).toBe("2026-05-13");

    // Rollover у наступну UTC-добу. Counter лишається той самий
    // (process didn't restart) → новий baseline = current counter value.
    // Тому новий tick має побачити spend = 0 і нічого не алертити.
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
    recordSpend(3.5);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);

    mockNow = new Date("2026-05-14T00:01:00Z").getTime();
    // Rollover на новий день. Spend сьогодні поки що 0.
    await guard.runBudgetCheckTick();

    // Ще $4 на сьогодні (counter monotonic) — soft має fire-нутись знову.
    recordSpend(4);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(2);
    expect(captures[1]?.threshold).toBe("soft");
    expect(captures[1]?.day).toBe("2026-05-14");
  });
});

describe("AnthropicBudgetGuard — baseline drift handling", () => {
  it("re-anchors baseline if counter monotonically decreased (restart race)", async () => {
    const captures: AnthropicBudgetCaptureInput[] = [];
    const guard = createGuard({
      capture: (input) => {
        captures.push(input);
      },
      redis: null,
    });
    recordSpend(4);
    await guard.runBudgetCheckTick();
    expect(captures).toHaveLength(1);
    expect(captures[0]?.threshold).toBe("soft");

    // Симулюємо "counter впав" (теоретично — рестарт + новий init
    // потрапив у середину tick-у; counter не може piecewise зменшитись,
    // але safety-сітка).
    aiCostEstimateUsd.reset();
    const result = await guard.runBudgetCheckTick();
    expect(result.spendUsd).toBe(0);
    expect(captures).toHaveLength(1);
  });
});
