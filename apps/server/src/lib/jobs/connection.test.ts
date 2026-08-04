import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { REDIS_URL: undefined as string | undefined },
}));

vi.mock("../../env.js", () => ({
  env: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockEnv as Record<string | symbol, unknown>)[prop];
      },
    },
  ),
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
  serializeError: vi.fn((err: unknown) => ({ message: String(err) })),
}));

const mockIORedisInstance = vi.hoisted(() => ({
  on: vi.fn(),
}));
const MockIORedis = vi.hoisted(() =>
  vi.fn(function MockIORedisCtor() {
    return mockIORedisInstance;
  }),
);
vi.mock("ioredis", () => ({
  default: MockIORedis,
}));

import {
  createBullConnection,
  BULLMQ_QUEUE_PREFIX,
  AUTH_MAIL_QUEUE_NAME,
  AI_MEMORY_INGEST_QUEUE_NAME,
} from "./connection.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.REDIS_URL = undefined;
});

describe("createBullConnection", () => {
  it("returns null when REDIS_URL is not configured", () => {
    const conn = createBullConnection("test-queue");
    expect(conn).toBeNull();
    expect(MockIORedis).not.toHaveBeenCalled();
  });

  it("constructs an ioredis client with BullMQ-required options when REDIS_URL is set", () => {
    mockEnv.REDIS_URL = "redis://localhost:6379";
    const conn = createBullConnection("test-queue");
    expect(conn).toBe(mockIORedisInstance);
    expect(MockIORedis).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({
        maxRetriesPerRequest: null,
        enableOfflineQueue: true,
      }),
    );
    // Registers error/connect listeners so a dropped connection doesn't
    // crash the process with an unhandled 'error' event.
    expect(mockIORedisInstance.on).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
    expect(mockIORedisInstance.on).toHaveBeenCalledWith(
      "connect",
      expect.any(Function),
    );
  });
});

describe("BullMQ queue naming constants", () => {
  it("uses the sergeant key-namespace prefix", () => {
    expect(BULLMQ_QUEUE_PREFIX).toBe("sergeant");
  });

  it("exposes stable queue names shared between producer and consumer", () => {
    expect(AUTH_MAIL_QUEUE_NAME).toBe("auth-mail");
    expect(AI_MEMORY_INGEST_QUEUE_NAME).toBe("ai-memory-ingest");
  });
});
