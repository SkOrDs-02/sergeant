import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { env } from "../../env.js";

/**
 * Targets the one remaining branch in the default (no-`deps`) client
 * resolution path of `readTelegramTopicHistory` that
 * `read-telegram-topic-history.test.ts` can't reach without mocking:
 * `createTelegramBotClient` throwing during the lazy build, which the
 * function catches and falls back to `client = null` (archive-only).
 * A real `createTelegramBotClient` never throws for a truthy token, so
 * this needs a module mock.
 */

vi.mock("../telegram/index.js", async () => {
  const actual = await vi.importActual<typeof import("../telegram/index.js")>(
    "../telegram/index.js",
  );
  return {
    ...actual,
    createTelegramBotClient: () => {
      throw new Error("invalid bot token format");
    },
  };
});

const ENV_KEYS = ["SERGEANT_ALERT_BOT_TOKEN", "SERGEANT_OPS_CHAT_ID"] as const;
type PatchableKey = (typeof ENV_KEYS)[number];

const originalEnv: Record<PatchableKey, unknown> = ENV_KEYS.reduce(
  (acc, key) => {
    acc[key] = (env as Record<string, unknown>)[key];
    return acc;
  },
  {} as Record<PatchableKey, unknown>,
);

function patchEnv(overrides: Partial<Record<PatchableKey, unknown>>): void {
  for (const [key, value] of Object.entries(overrides)) {
    Object.defineProperty(env, key, {
      value,
      writable: false,
      configurable: true,
      enumerable: true,
    });
  }
}

function restoreEnv(): void {
  patchEnv(originalEnv);
}

beforeEach(() => {
  restoreEnv();
});

afterEach(() => {
  restoreEnv();
});

function makePool(rows: Record<string, unknown>[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
}

describe("readTelegramTopicHistory — createTelegramBotClient throws during lazy build", () => {
  it("falls back to client=null (archive-only) instead of propagating the constructor error", async () => {
    patchEnv({
      SERGEANT_ALERT_BOT_TOKEN: "malformed-token",
      SERGEANT_OPS_CHAT_ID: "-1001",
    });
    const { readTelegramTopicHistory } = await import("./tools.js");
    const pool = makePool([
      {
        id: 1,
        sent_at: "2026-05-13T10:00:00.000Z",
        topic: "ops",
        message_id: 100,
        text: "hello",
        source: "alert",
        dedupe_key: null,
        metadata: {},
      },
    ]);

    const result = await readTelegramTopicHistory(pool, { topic: "ops" });

    expect(result.origin).toBe("archive");
    expect(result.messages).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });
});
