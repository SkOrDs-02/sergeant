import { afterEach, describe, expect, it, vi } from "vitest";

interface RedisModule {
  connectRedis(): void;
  disconnectRedis(): Promise<void>;
  getRedis(): unknown;
  getRedisStats(): { connected: boolean; reconnectAttempts: number };
  pingRedis(): Promise<boolean>;
}

interface RedisHarness {
  mod: RedisModule;
  redisCtor: ReturnType<typeof vi.fn>;
  redisInstance: {
    on: ReturnType<typeof vi.fn>;
    quit: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
  } | null;
  handlers: Record<string, (...args: never[]) => void>;
  logger: {
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

async function loadRedis({
  redisUrl = "",
  maxRetries = 3,
  reconnectDelayMs = 100,
  maxReconnectDelayMs = 1_000,
}: {
  redisUrl?: string;
  maxRetries?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
} = {}): Promise<RedisHarness> {
  vi.resetModules();
  const handlers: RedisHarness["handlers"] = {};
  let redisInstance: RedisHarness["redisInstance"] = null;
  const redisCtor = vi.fn();
  function MockRedis(this: unknown, url: string, options: unknown) {
    redisCtor(url, options);
    redisInstance = {
      on: vi.fn((event: string, handler: (...args: never[]) => void) => {
        handlers[event] = handler;
        return redisInstance;
      }),
      quit: vi.fn().mockResolvedValue(undefined),
      ping: vi.fn().mockResolvedValue("PONG"),
    };
    return redisInstance;
  }
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  vi.doMock("ioredis", () => ({ default: MockRedis }));
  vi.doMock("../env.js", () => ({
    env: {
      REDIS_URL: redisUrl,
      REDIS_MAX_RETRIES: maxRetries,
      REDIS_RECONNECT_DELAY_MS: reconnectDelayMs,
      REDIS_MAX_RECONNECT_DELAY_MS: maxReconnectDelayMs,
    },
  }));
  vi.doMock("../obs/logger.js", () => ({ logger }));

  const mod = (await import("./redis.js")) as RedisModule;
  return { mod, redisCtor, redisInstance, handlers, logger };
}

describe("redis client wrapper", () => {
  afterEach(() => {
    vi.doUnmock("ioredis");
    vi.doUnmock("../env.js");
    vi.doUnmock("../obs/logger.js");
  });

  it("stays disabled without REDIS_URL", async () => {
    const { mod, redisCtor, logger } = await loadRedis();

    mod.connectRedis();

    expect(redisCtor).not.toHaveBeenCalled();
    expect(mod.getRedis()).toBeNull();
    expect(mod.getRedisStats()).toEqual({
      connected: false,
      reconnectAttempts: 0,
    });
    expect(await mod.pingRedis()).toBe(false);
    await expect(mod.disconnectRedis()).resolves.toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith({
      msg: "redis_disabled",
      reason: "no REDIS_URL",
    });
  });

  it("creates Redis with retry policy and tracks lifecycle events", async () => {
    const { mod, redisCtor, handlers, logger } = await loadRedis({
      redisUrl: "redis://localhost:6379",
      maxRetries: 2,
      reconnectDelayMs: 50,
      maxReconnectDelayMs: 120,
    });

    mod.connectRedis();

    expect(redisCtor).toHaveBeenCalledTimes(1);
    const [, options] = redisCtor.mock.calls[0] as [
      string,
      {
        maxRetriesPerRequest: number;
        enableOfflineQueue: boolean;
        lazyConnect: boolean;
        connectTimeout: number;
        commandTimeout: number;
        retryStrategy(times: number): number | null;
      },
    ];
    expect(options).toMatchObject({
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      connectTimeout: 5_000,
      commandTimeout: 3_000,
    });
    expect(options.retryStrategy(1)).toBe(50);
    expect(options.retryStrategy(3)).toBeNull();
    expect(logger.error).toHaveBeenCalledWith({
      msg: "redis_max_retries_exceeded",
      attempts: 3,
      maxRetries: 2,
    });

    handlers["connect"]?.();
    expect(mod.getRedisStats()).toEqual({
      connected: true,
      reconnectAttempts: 0,
    });
    handlers["ready"]?.();
    expect(mod.getRedisStats().connected).toBe(true);
    handlers["reconnecting"]?.();
    expect(mod.getRedisStats().connected).toBe(false);
    handlers["error"]?.(new Error("boom") as never);
    expect(logger.warn).toHaveBeenCalledWith({
      msg: "redis_error",
      err: "boom",
    });
    handlers["close"]?.();
    expect(mod.getRedisStats().connected).toBe(false);

    expect(mod.getRedis()).toMatchObject({
      on: expect.any(Function),
      ping: expect.any(Function),
      quit: expect.any(Function),
    });
  });

  it("pings Redis and disconnects gracefully", async () => {
    const harness = await loadRedis({ redisUrl: "redis://localhost:6379" });
    harness.mod.connectRedis();
    const instance = harness.mod.getRedis() as {
      ping: ReturnType<typeof vi.fn>;
      quit: ReturnType<typeof vi.fn>;
    } | null;
    expect(instance).not.toBeNull();

    await expect(harness.mod.pingRedis()).resolves.toBe(true);

    instance?.ping.mockResolvedValueOnce("NOPE");
    await expect(harness.mod.pingRedis()).resolves.toBe(false);

    instance?.ping.mockRejectedValueOnce(new Error("offline"));
    await expect(harness.mod.pingRedis()).resolves.toBe(false);

    instance?.quit.mockRejectedValueOnce(new Error("quit failed"));
    await expect(harness.mod.disconnectRedis()).resolves.toBeUndefined();
    expect(harness.mod.getRedis()).toBeNull();
    expect(harness.mod.getRedisStats().connected).toBe(false);
  });
});
