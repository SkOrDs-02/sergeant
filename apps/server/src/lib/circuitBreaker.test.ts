import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Unit-тести для CircuitBreaker (apps/server/src/lib/circuitBreaker.ts).
 *
 * Покриває:
 *   • Конструктор + дефолти з env (`AI_CIRCUIT_BREAKER_THRESHOLD`,
 *     `AI_CIRCUIT_BREAKER_RESET_MS`) і user-override опцій.
 *   • `execute()` — CLOSED happy path, інкремент failures, скид failures
 *     після успіху, перехід CLOSED → OPEN при досягненні `threshold`.
 *   • `execute()` — OPEN: `CircuitOpenError` зі стабільним `retryAfterMs`,
 *     перехід OPEN → HALF_OPEN після `resetTimeoutMs`.
 *   • `execute()` — HALF_OPEN: success(es) → CLOSED, будь-який fail → OPEN.
 *   • `isAllowing()` для всіх трьох станів (з урахуванням elapsed time).
 *   • `reset()` — форс-CLOSED і no-op коли вже у тому самому стані.
 *   • `getStats()` — shape + `timeSinceLastFailure` null/number.
 *   • `onStateChange` callback фірить пари (from, to).
 *   • Логування `circuit_breaker_transition` + інкремент
 *     `circuitBreakerTripsTotal`; помилки prom-client глушаться.
 *   • `CircuitOpenError` — code/name/retryAfterMs/повідомлення.
 *   • Anthropic-singleton — ім'я + початковий стан.
 */

vi.mock("../obs/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../obs/metrics.js", () => ({
  circuitBreakerState: { set: vi.fn() },
  circuitBreakerTripsTotal: { inc: vi.fn() },
}));

vi.mock("../env.js", () => ({
  env: {
    AI_CIRCUIT_BREAKER_THRESHOLD: 5,
    AI_CIRCUIT_BREAKER_RESET_MS: 30_000,
  },
}));

import { logger as _logger } from "../obs/logger.js";
import {
  circuitBreakerState as _stateGauge,
  circuitBreakerTripsTotal as _tripsCounter,
} from "../obs/metrics.js";
import {
  anthropicCircuitBreaker,
  CircuitBreaker,
  CircuitOpenError,
  CircuitState,
} from "./circuitBreaker.js";

const logger = _logger as unknown as {
  debug: Mock;
  error: Mock;
  info: Mock;
  warn: Mock;
};
const stateGauge = _stateGauge as unknown as { set: Mock };
const tripsCounter = _tripsCounter as unknown as { inc: Mock };

const FIXED_NOW = new Date("2026-05-13T12:00:00Z");

async function failN(breaker: CircuitBreaker, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await expect(
      breaker.execute(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CircuitBreaker — конструктор і дефолти", () => {
  it("стартує у CLOSED-стані з нульовими лічильниками", () => {
    const breaker = new CircuitBreaker({ name: "fresh" });

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.isAllowing()).toBe(true);
    expect(breaker.getStats()).toEqual({
      name: "fresh",
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      timeSinceLastFailure: null,
    });
  });

  it("ініціалізує prom-метрику стану на CLOSED при створенні", () => {
    new CircuitBreaker({ name: "init" });

    expect(stateGauge.set).toHaveBeenCalledWith(
      { name: "init" },
      CircuitState.CLOSED,
    );
  });

  it("використовує env-дефолти, якщо не передано threshold/resetTimeoutMs", async () => {
    // env-mock: THRESHOLD=5, RESET_MS=30_000.
    const breaker = new CircuitBreaker({ name: "env-defaults" });

    // 4 fail-и — все ще CLOSED.
    await failN(breaker, 4);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.getStats().failures).toBe(4);

    // 5-й fail трипить.
    await failN(breaker, 1);
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // resetTimeoutMs дефолт = 30_000.
    const err = await breaker
      .execute(async () => "noop")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect((err as CircuitOpenError).retryAfterMs).toBe(30_000);
  });

  it("шанує користувацькі threshold / resetTimeoutMs / successThreshold", async () => {
    const breaker = new CircuitBreaker({
      name: "custom",
      threshold: 2,
      resetTimeoutMs: 1_000,
      successThreshold: 3,
    });

    await failN(breaker, 2);
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // resetTimeoutMs=1_000 → менше → OPEN ще не дозволяє.
    expect(breaker.isAllowing()).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(breaker.isAllowing()).toBe(true);
  });
});

describe("CircuitBreaker.execute() — CLOSED state", () => {
  it("повертає результат при успішному виклику", async () => {
    const breaker = new CircuitBreaker({ name: "ok" });

    const result = await breaker.execute(async () => 42);

    expect(result).toBe(42);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("кидає оригінальну помилку та інкрементує failures", async () => {
    const breaker = new CircuitBreaker({ name: "fail-once", threshold: 5 });
    const err = new Error("upstream");

    await expect(
      breaker.execute(async () => {
        throw err;
      }),
    ).rejects.toBe(err);

    expect(breaker.getStats().failures).toBe(1);
    expect(breaker.getStats().lastFailureTime).toBe(FIXED_NOW.getTime());
    expect(breaker.getStats().timeSinceLastFailure).toBe(0);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("скидає лічильник failures після успіху у CLOSED", async () => {
    const breaker = new CircuitBreaker({ name: "rst", threshold: 5 });

    await failN(breaker, 2);
    expect(breaker.getStats().failures).toBe(2);

    await breaker.execute(async () => "ok");

    expect(breaker.getStats().failures).toBe(0);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it("переходить CLOSED → OPEN при досягненні threshold", async () => {
    const breaker = new CircuitBreaker({ name: "trip", threshold: 2 });

    await failN(breaker, 1);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    await failN(breaker, 1);
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Логуємо перехід.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "circuit_breaker_transition",
        name: "trip",
        from: "closed",
        to: "open",
      }),
    );
    // Інкрементуємо prom-counter.
    expect(tripsCounter.inc).toHaveBeenCalledWith({
      name: "trip",
      from: "closed",
      to: "open",
    });
    // Оновлюємо state-gauge.
    expect(stateGauge.set).toHaveBeenLastCalledWith(
      { name: "trip" },
      CircuitState.OPEN,
    );
  });

  it("ресетить лічильники failures/successes при переході", async () => {
    const breaker = new CircuitBreaker({ name: "tr-reset", threshold: 3 });

    await failN(breaker, 3);
    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(breaker.getStats().failures).toBe(0);
    expect(breaker.getStats().successes).toBe(0);
  });
});

describe("CircuitBreaker.execute() — OPEN state", () => {
  it("одразу кидає CircuitOpenError без виклику fn до закінчення resetTimeoutMs", async () => {
    const breaker = new CircuitBreaker({
      name: "open-fast",
      threshold: 1,
      resetTimeoutMs: 5_000,
    });
    await failN(breaker, 1);
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    const fn = vi.fn(async () => "should-not-run");
    const err = await breaker.execute(fn).catch((e: unknown) => e);

    expect(fn).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect((err as CircuitOpenError).retryAfterMs).toBe(5_000);
    expect((err as CircuitOpenError).code).toBe("CIRCUIT_OPEN");
  });

  it("повертає коректний retryAfterMs з урахуванням elapsed time", async () => {
    const breaker = new CircuitBreaker({
      name: "open-elapsed",
      threshold: 1,
      resetTimeoutMs: 10_000,
    });
    await failN(breaker, 1);
    vi.advanceTimersByTime(3_000);

    const err = await breaker.execute(async () => "x").catch((e: unknown) => e);

    expect((err as CircuitOpenError).retryAfterMs).toBe(7_000);
  });

  it("переходить OPEN → HALF_OPEN після resetTimeoutMs і запускає fn", async () => {
    const breaker = new CircuitBreaker({
      name: "open-to-half",
      threshold: 1,
      resetTimeoutMs: 5_000,
      successThreshold: 2,
    });
    await failN(breaker, 1);
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    vi.advanceTimersByTime(5_000);

    const fn = vi.fn(async () => "probe-ok");
    const result = await breaker.execute(fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe("probe-ok");
    // successThreshold=2 → перший success у HALF_OPEN не закриває.
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    // Лог переходу open → half-open.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "circuit_breaker_transition",
        from: "open",
        to: "half-open",
      }),
    );
  });
});

describe("CircuitBreaker.execute() — HALF_OPEN state", () => {
  async function intoHalfOpen(
    breaker: CircuitBreaker,
    resetTimeoutMs: number,
  ): Promise<void> {
    await failN(breaker, 1);
    vi.advanceTimersByTime(resetTimeoutMs);
    // Перший виклик у OPEN-стані з достатнім elapsed time → HALF_OPEN.
    // Виконуємо легкий probe, який повертає успіх, щоб опинитись у HALF_OPEN
    // без закриття (successThreshold у викликача має бути ≥ 2).
    await breaker.execute(async () => "probe");
  }

  it("успіх у HALF_OPEN інкрементує successes, але не закриває до successThreshold", async () => {
    const breaker = new CircuitBreaker({
      name: "half-stay",
      threshold: 1,
      resetTimeoutMs: 1_000,
      successThreshold: 3,
    });

    await intoHalfOpen(breaker, 1_000);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    expect(breaker.getStats().successes).toBe(1);

    await breaker.execute(async () => "two");
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    expect(breaker.getStats().successes).toBe(2);
  });

  it("закриває контур після successThreshold успіхів у HALF_OPEN", async () => {
    const breaker = new CircuitBreaker({
      name: "half-close",
      threshold: 1,
      resetTimeoutMs: 1_000,
      successThreshold: 2,
    });

    await intoHalfOpen(breaker, 1_000);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    await breaker.execute(async () => "close");
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "circuit_breaker_transition",
        from: "half-open",
        to: "closed",
      }),
    );
  });

  it("будь-який fail у HALF_OPEN переоткриває контур", async () => {
    const breaker = new CircuitBreaker({
      name: "half-reopen",
      threshold: 1,
      resetTimeoutMs: 1_000,
      successThreshold: 2,
    });

    await intoHalfOpen(breaker, 1_000);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    await expect(
      breaker.execute(async () => {
        throw new Error("half-fail");
      }),
    ).rejects.toThrow("half-fail");

    expect(breaker.getState()).toBe(CircuitState.OPEN);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "circuit_breaker_transition",
        from: "half-open",
        to: "open",
      }),
    );
  });

  it("після reopen-у respect-ить новий resetTimeoutMs (lastFailureTime оновлено)", async () => {
    const breaker = new CircuitBreaker({
      name: "half-reopen-cooldown",
      threshold: 1,
      resetTimeoutMs: 5_000,
      successThreshold: 2,
    });

    await intoHalfOpen(breaker, 5_000);
    // Тепер вже у HALF_OPEN; кинемо помилку — OPEN з новим lastFailureTime.
    await expect(
      breaker.execute(async () => {
        throw new Error("rfail");
      }),
    ).rejects.toThrow();

    expect(breaker.getState()).toBe(CircuitState.OPEN);
    // resetTimeoutMs повний.
    const err = await breaker.execute(async () => "x").catch((e: unknown) => e);
    expect((err as CircuitOpenError).retryAfterMs).toBe(5_000);
  });
});

describe("CircuitBreaker.isAllowing()", () => {
  it("повертає true у CLOSED", () => {
    const breaker = new CircuitBreaker({ name: "allow-closed" });
    expect(breaker.isAllowing()).toBe(true);
  });

  it("повертає false у OPEN до закінчення resetTimeoutMs", async () => {
    const breaker = new CircuitBreaker({
      name: "allow-open",
      threshold: 1,
      resetTimeoutMs: 10_000,
    });
    await failN(breaker, 1);
    expect(breaker.isAllowing()).toBe(false);

    vi.advanceTimersByTime(9_999);
    expect(breaker.isAllowing()).toBe(false);
  });

  it("повертає true у OPEN після resetTimeoutMs (probe готовий)", async () => {
    const breaker = new CircuitBreaker({
      name: "allow-cooled",
      threshold: 1,
      resetTimeoutMs: 1_000,
    });
    await failN(breaker, 1);
    vi.advanceTimersByTime(1_000);
    expect(breaker.isAllowing()).toBe(true);
  });

  it("повертає true у HALF_OPEN", async () => {
    const breaker = new CircuitBreaker({
      name: "allow-half",
      threshold: 1,
      resetTimeoutMs: 500,
      successThreshold: 5,
    });
    await failN(breaker, 1);
    vi.advanceTimersByTime(500);
    await breaker.execute(async () => "probe");
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    expect(breaker.isAllowing()).toBe(true);
  });
});

describe("CircuitBreaker.reset()", () => {
  it("форс-CLOSED після того, як контур було відкрито", async () => {
    const breaker = new CircuitBreaker({
      name: "manual-reset",
      threshold: 1,
    });
    await failN(breaker, 1);
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    breaker.reset();

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.getStats().failures).toBe(0);
    expect(breaker.getStats().successes).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ from: "open", to: "closed" }),
    );
  });

  it("no-op якщо контур уже CLOSED (early-return у transitionTo)", () => {
    const breaker = new CircuitBreaker({ name: "noop-reset" });
    // Очищаємо мокі від виклику конструктора, щоб ізолювати reset().
    vi.clearAllMocks();

    breaker.reset();

    expect(logger.info).not.toHaveBeenCalled();
    expect(tripsCounter.inc).not.toHaveBeenCalled();
  });
});

describe("CircuitBreaker.getStats()", () => {
  it("повертає string-state і числові лічильники", () => {
    const breaker = new CircuitBreaker({ name: "stats" });
    const stats = breaker.getStats();
    expect(stats.state).toBe("closed");
    expect(typeof stats.failures).toBe("number");
    expect(typeof stats.successes).toBe("number");
    expect(stats.lastFailureTime).toBe(0);
    expect(stats.timeSinceLastFailure).toBeNull();
  });

  it("повертає числовий timeSinceLastFailure після хоча б одного fail-у", async () => {
    const breaker = new CircuitBreaker({ name: "stats-elapsed", threshold: 5 });
    await failN(breaker, 1);

    vi.advanceTimersByTime(2_500);

    const stats = breaker.getStats();
    expect(stats.lastFailureTime).toBe(FIXED_NOW.getTime());
    expect(stats.timeSinceLastFailure).toBe(2_500);
    expect(stats.state).toBe("closed");
  });

  it("повертає state='open'/'half-open' для відповідних станів", async () => {
    const breaker = new CircuitBreaker({
      name: "stats-states",
      threshold: 1,
      resetTimeoutMs: 1_000,
      successThreshold: 5,
    });

    await failN(breaker, 1);
    expect(breaker.getStats().state).toBe("open");

    vi.advanceTimersByTime(1_000);
    await breaker.execute(async () => "probe");
    expect(breaker.getStats().state).toBe("half-open");
  });
});

describe("CircuitBreaker — onStateChange callback", () => {
  it("викликається з (from, to) на кожному переході", async () => {
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({
      name: "cb",
      threshold: 1,
      resetTimeoutMs: 1_000,
      successThreshold: 1,
      onStateChange,
    });

    // CLOSED → OPEN
    await failN(breaker, 1);
    // OPEN → HALF_OPEN → CLOSED (за один execute)
    vi.advanceTimersByTime(1_000);
    await breaker.execute(async () => "go");

    expect(onStateChange.mock.calls).toEqual([
      [CircuitState.CLOSED, CircuitState.OPEN],
      [CircuitState.OPEN, CircuitState.HALF_OPEN],
      [CircuitState.HALF_OPEN, CircuitState.CLOSED],
    ]);
  });

  it("не викликається коли transitionTo трапився на той самий стан", () => {
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({ name: "same", onStateChange });

    breaker.reset(); // CLOSED → CLOSED

    expect(onStateChange).not.toHaveBeenCalled();
  });
});

describe("CircuitBreaker — prom-client помилки глушаться", () => {
  it("кидок з circuitBreakerTripsTotal.inc не зриває перехід", async () => {
    tripsCounter.inc.mockImplementationOnce(() => {
      throw new Error("metric down");
    });
    const breaker = new CircuitBreaker({ name: "metric-fail", threshold: 1 });

    await expect(
      breaker.execute(async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");

    // Стан все одно перейшов, callback викликається після metric-try/catch.
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });

  it("кидок з circuitBreakerState.set не зриває конструктор", () => {
    stateGauge.set.mockImplementationOnce(() => {
      throw new Error("gauge down");
    });

    expect(() => new CircuitBreaker({ name: "gauge-fail" })).not.toThrow();
  });
});

describe("CircuitOpenError", () => {
  it("несе stable code, name, retryAfterMs і повідомлення з ім'ям і таймаутом", () => {
    const err = new CircuitOpenError("anthropic", 12_345);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect(err.code).toBe("CIRCUIT_OPEN");
    expect(err.name).toBe("CircuitOpenError");
    expect(err.retryAfterMs).toBe(12_345);
    expect(err.message).toBe(
      'Circuit breaker "anthropic" is open. Retry after 12345ms.',
    );
  });
});

describe("anthropicCircuitBreaker (shared singleton)", () => {
  it("експортується і має ім'я anthropic у getStats()", () => {
    expect(anthropicCircuitBreaker).toBeInstanceOf(CircuitBreaker);
    expect(anthropicCircuitBreaker.getStats().name).toBe("anthropic");
  });
});
