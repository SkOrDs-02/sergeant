/**
 * Unit tests for `readTelegramTopicHistory` (PR-35).
 *
 * The function combines `tg_topic_archive` reads with an optional Bot
 * API probe. We mock both surfaces:
 *   - `listTopicMessages` via a fake `pg.Pool.query` that returns
 *     archive rows (newest-first, mirroring the production query).
 *   - A handwritten `TelegramBotClient` mock (no `fetch` involved) so
 *     the tests don't depend on the wire protocol — that's covered in
 *     `bot-client.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { env } from "../../env.js";
import { readTelegramTopicHistory } from "./tools.js";
import {
  TelegramApiError,
  TelegramForbiddenError,
  TelegramRateLimitError,
  type TelegramBotClient,
  type TelegramUpdate,
} from "../telegram/index.js";
import { logger } from "../../obs/logger.js";

// Env keys this test mutates. Mirrors the snapshot+restore pattern used by
// `write-tools.test.ts` — `env` is frozen-by-convention so we use
// `Object.defineProperty` (the same trick `patchEnv` uses).
const ENV_KEYS = [
  "SERGEANT_ALERT_BOT_TOKEN",
  "SERGEANT_OPS_CHAT_ID",
  "TELEGRAM_TOPIC_OPS",
  "TELEGRAM_TOPIC_ENGINEERING",
  "TELEGRAM_TOPIC_GROWTH",
  "OPENCLAW_TELEGRAM_FETCH_UPDATES",
] as const;
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

interface ArchiveRow {
  id: number;
  sent_at: string;
  topic: string;
  message_id: number;
  text: string;
  source: string;
  dedupe_key: string | null;
  metadata: Record<string, unknown>;
}

function makeArchiveRow(overrides: Partial<ArchiveRow> = {}): ArchiveRow {
  return {
    id: 1,
    sent_at: "2026-05-13T12:00:00.000Z",
    topic: "ops",
    message_id: 100,
    text: "hello",
    source: "alert",
    dedupe_key: null,
    metadata: {},
    ...overrides,
  };
}

function makePool(rows: ArchiveRow[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
}

function makeClient(
  overrides: Partial<TelegramBotClient> = {},
): TelegramBotClient {
  return {
    getChat: vi
      .fn()
      .mockResolvedValue({ id: -1001, type: "supergroup", title: "Ops" }),
    getUpdates: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
});

describe("readTelegramTopicHistory — happy path", () => {
  it("returns archive rows normalized to the {id, from, text, date, replyToMessageId} shape", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
    });
    const pool = makePool([
      makeArchiveRow({
        message_id: 100,
        sent_at: "2026-05-13T10:00:00.000Z",
        text: "deploy started",
        source: "alert",
        metadata: { from: "n8n", reply_to_message_id: 99 },
      }),
      makeArchiveRow({
        id: 2,
        message_id: 101,
        sent_at: "2026-05-13T11:00:00.000Z",
        text: "deploy ok",
        source: "post_to_topic",
        metadata: {},
      }),
    ]);
    const client = makeClient();

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(client.getChat).toHaveBeenCalledWith("-1001");
    expect(result).toMatchObject({
      topic: "ops",
      topicId: 42,
      origin: "archive",
    });
    expect(result.error).toBeUndefined();
    expect(result.messages).toHaveLength(2);
    // Newest-first ordering: 11:00 (post_to_topic) before 10:00 (alert).
    expect(result.messages[0]).toEqual({
      id: 101,
      from: null,
      text: "deploy ok",
      date: "2026-05-13T11:00:00.000Z",
      replyToMessageId: null,
      source: "post_to_topic",
    });
    expect(result.messages[1]).toEqual({
      id: 100,
      from: "n8n",
      text: "deploy started",
      date: "2026-05-13T10:00:00.000Z",
      replyToMessageId: 99,
      source: "alert",
    });
  });

  it("returns empty list + advisory note when archive is empty (and no error)", async () => {
    patchEnv({ SERGEANT_OPS_CHAT_ID: "-1001" });
    const pool = makePool([]);
    const client = makeClient();

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.messages).toHaveLength(0);
    expect(result.note).toMatch(/tg_topic_archive returned no rows/);
    expect(result.error).toBeUndefined();
    expect(result.topicId).toBeNull(); // TELEGRAM_TOPIC_OPS not set
  });

  it("skips the Bot API probe entirely when telegramClient=null is passed", async () => {
    const pool = makePool([
      makeArchiveRow({
        message_id: 100,
        sent_at: "2026-05-13T10:00:00.000Z",
      }),
    ]);

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: null },
    );

    expect(result.origin).toBe("archive");
    expect(result.error).toBeUndefined();
    expect(result.messages).toHaveLength(1);
  });

  it("clamps limit by env (TELEGRAM_TOPIC_HISTORY_LIMIT) and forwards it to listTopicMessages", async () => {
    const pool = makePool([]);
    const querySpy = pool.query as unknown as ReturnType<typeof vi.fn>;
    await readTelegramTopicHistory(
      pool,
      { topic: "ops", limit: 9999 },
      { telegramClient: null },
    );
    const lastCall = querySpy.mock.calls[querySpy.mock.calls.length - 1]!;
    const params = lastCall[1] as unknown[];
    // params: [topic, limit] (no `since`); limit must be clamped to <=100.
    const limitParam = params[params.length - 1];
    expect(typeof limitParam).toBe("number");
    expect(limitParam as number).toBeLessThanOrEqual(100);
    expect(limitParam as number).toBeGreaterThanOrEqual(1);
  });

  it("merges live Bot API getUpdates when OPENCLAW_TELEGRAM_FETCH_UPDATES=true", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });

    const pool = makePool([
      makeArchiveRow({
        message_id: 100,
        sent_at: "2026-05-13T10:00:00.000Z",
        text: "archived alert",
      }),
    ]);

    const liveUpdate: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 200,
        message_thread_id: 42,
        chat: { id: -1001, type: "supergroup" },
        from: { id: 7, is_bot: false, first_name: "Dima", username: "skords" },
        date: Math.floor(new Date("2026-05-13T12:30:00Z").getTime() / 1000),
        text: "manual update from human",
        reply_to_message: { message_id: 100 },
      },
    };

    const client = makeClient({
      getUpdates: vi.fn().mockResolvedValue([liveUpdate]),
    });

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops", limit: 50 },
      { telegramClient: client },
    );

    expect(client.getUpdates).toHaveBeenCalled();
    expect(result.origin).toBe("merged");
    expect(result.messages).toHaveLength(2);
    // newest first
    expect(result.messages[0]).toEqual({
      id: 200,
      from: "@skords",
      text: "manual update from human",
      date: "2026-05-13T12:30:00.000Z",
      replyToMessageId: 100,
      source: "bot_api",
    });
  });

  it("filters live updates by chat_id and message_thread_id", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });

    const wrongChat: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 300,
        message_thread_id: 42,
        chat: { id: -1002, type: "supergroup" }, // wrong chat
        date: Math.floor(Date.now() / 1000),
        text: "not ours",
      },
    };
    const wrongTopic: TelegramUpdate = {
      update_id: 2,
      message: {
        message_id: 301,
        message_thread_id: 999, // wrong topic
        chat: { id: -1001, type: "supergroup" },
        date: Math.floor(Date.now() / 1000),
        text: "wrong topic",
      },
    };

    const client = makeClient({
      getUpdates: vi.fn().mockResolvedValue([wrongChat, wrongTopic]),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.messages).toHaveLength(0);
    expect(result.origin).toBe("archive");
  });
});

describe("readTelegramTopicHistory — error handling", () => {
  it("returns a structured rate_limit error and keeps archive data when getChat 429s", async () => {
    patchEnv({ SERGEANT_OPS_CHAT_ID: "-1001" });
    const pool = makePool([
      makeArchiveRow({
        message_id: 100,
        sent_at: "2026-05-13T10:00:00.000Z",
        text: "earlier alert",
      }),
    ]);

    const client = makeClient({
      getChat: vi
        .fn()
        .mockRejectedValue(
          new TelegramRateLimitError(
            "getChat",
            "Too Many Requests: retry after 30",
            30,
          ),
        ),
    });

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({
      code: "rate_limit",
      message: "Too Many Requests: retry after 30",
      retryAfter: 30,
    });
    // Archive data is still returned — the LLM can show what it has.
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.id).toBe(100);
    expect(result.origin).toBe("archive");
  });

  it("returns a structured forbidden error when getChat 403s", async () => {
    patchEnv({ SERGEANT_OPS_CHAT_ID: "-1001" });
    const pool = makePool([]);

    const client = makeClient({
      getChat: vi
        .fn()
        .mockRejectedValue(
          new TelegramForbiddenError(
            "getChat",
            403,
            "Forbidden: bot was kicked from the supergroup chat",
          ),
        ),
    });

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({
      code: "forbidden",
      message: "Forbidden: bot was kicked from the supergroup chat",
    });
    expect(result.messages).toHaveLength(0);
    // No `note` when an error is set — the error explains the empty list.
    expect(result.note).toBeUndefined();
  });

  it("does not invoke getUpdates if the access probe already failed", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });

    const getUpdates = vi.fn().mockResolvedValue([]);
    const client = makeClient({
      getChat: vi
        .fn()
        .mockRejectedValue(
          new TelegramForbiddenError("getChat", 403, "Forbidden"),
        ),
      getUpdates,
    });

    await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(getUpdates).not.toHaveBeenCalled();
  });

  it("returns a structured api_error for a generic TelegramApiError from getChat", async () => {
    patchEnv({ SERGEANT_OPS_CHAT_ID: "-1001" });
    const client = makeClient({
      getChat: vi
        .fn()
        .mockRejectedValue(
          new TelegramApiError("getChat", 500, "Internal Server Error"),
        ),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({
      code: "api_error",
      message: "Internal Server Error",
    });
  });

  it("maps an unrecognised getChat error to api_error and logs a warning", async () => {
    patchEnv({ SERGEANT_OPS_CHAT_ID: "-1001" });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const client = makeClient({
      getChat: vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({ code: "api_error", message: "ECONNRESET" });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "ops" }),
      expect.stringMatching(/unexpected getChat error/),
    );
    warnSpy.mockRestore();
  });

  it("best-effort getUpdates failure (rate_limit) surfaces as error but keeps archive messages", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const pool = makePool([
      makeArchiveRow({ message_id: 100, sent_at: "2026-05-13T10:00:00.000Z" }),
    ]);
    const client = makeClient({
      getUpdates: vi
        .fn()
        .mockRejectedValue(
          new TelegramRateLimitError("getUpdates", "Too Many Requests", 5),
        ),
    });

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({
      code: "rate_limit",
      message: "Too Many Requests",
      retryAfter: 5,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.origin).toBe("archive");
  });

  it("best-effort getUpdates failure (forbidden) is mapped to a structured error", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const client = makeClient({
      getUpdates: vi
        .fn()
        .mockRejectedValue(
          new TelegramForbiddenError("getUpdates", 403, "Forbidden"),
        ),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({ code: "forbidden", message: "Forbidden" });
  });

  it("best-effort getUpdates failure (generic api_error) is mapped to a structured error", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const client = makeClient({
      getUpdates: vi
        .fn()
        .mockRejectedValue(
          new TelegramApiError("getUpdates", 500, "Server Error"),
        ),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toEqual({
      code: "api_error",
      message: "Server Error",
    });
  });

  it("silently ignores an unrecognised getUpdates failure (no error, no throw)", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const pool = makePool([
      makeArchiveRow({ message_id: 100, sent_at: "2026-05-13T10:00:00.000Z" }),
    ]);
    const client = makeClient({
      getUpdates: vi.fn().mockRejectedValue(new Error("weird transport blip")),
    });

    const result = await readTelegramTopicHistory(
      pool,
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.error).toBeUndefined();
    expect(result.messages).toHaveLength(1);
    expect(result.origin).toBe("archive");
  });

  it("does not overwrite an existing getChat error with a getUpdates failure", async () => {
    // getChat itself never fails here because OPENCLAW_TELEGRAM_FETCH_UPDATES
    // gates on `!error` before calling getUpdates — assert getUpdates is
    // skipped entirely once getChat already set an error (covered above by
    // "does not invoke getUpdates if the access probe already failed"), and
    // here that the reverse composition (getChat OK, getUpdates fails) does
    // populate exactly one error, not a stacked/overwritten one.
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const client = makeClient({
      getChat: vi.fn().mockResolvedValue({ id: -1001, type: "supergroup" }),
      getUpdates: vi
        .fn()
        .mockRejectedValue(
          new TelegramForbiddenError("getUpdates", 403, "kicked mid-session"),
        ),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(client.getChat).toHaveBeenCalledTimes(1);
    expect(result.error).toEqual({
      code: "forbidden",
      message: "kicked mid-session",
    });
  });
});

describe("readTelegramTopicHistory — topic env resolution", () => {
  it("resolves the 'engineering' topic id from TELEGRAM_TOPIC_ENGINEERING", async () => {
    patchEnv({ TELEGRAM_TOPIC_ENGINEERING: "77" });
    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "engineering" },
      { telegramClient: null },
    );
    expect(result.topicId).toBe(77);
  });

  it("resolves the 'growth' topic id from TELEGRAM_TOPIC_GROWTH", async () => {
    patchEnv({ TELEGRAM_TOPIC_GROWTH: "88" });
    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "growth" },
      { telegramClient: null },
    );
    expect(result.topicId).toBe(88);
  });

  it("returns topicId=null for an unmapped topic key", async () => {
    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "incidents" },
      { telegramClient: null },
    );
    expect(result.topicId).toBeNull();
  });

  it("returns topicId=null when the mapped env var is set to a non-numeric value", async () => {
    patchEnv({ TELEGRAM_TOPIC_OPS: "not-a-number" });
    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: null },
    );
    expect(result.topicId).toBeNull();
  });
});

describe("readTelegramTopicHistory — live-update author formatting", () => {
  it("formats a channel post author from sender_chat.title when there's no `from` user", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const update: TelegramUpdate = {
      update_id: 1,
      channel_post: {
        message_id: 500,
        message_thread_id: 42,
        chat: { id: -1001, type: "supergroup" },
        sender_chat: { id: -2002, type: "channel", title: "Sergeant Bot" },
        date: Math.floor(Date.now() / 1000),
        text: "automated channel post",
      },
    };
    const client = makeClient({
      getUpdates: vi.fn().mockResolvedValue([update]),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.messages[0]?.from).toBe("Sergeant Bot");
  });

  it("formats a user's first_name + last_name when no username is set", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 501,
        message_thread_id: 42,
        chat: { id: -1001, type: "supergroup" },
        from: { id: 9, is_bot: false, first_name: "Dima", last_name: "K" },
        date: Math.floor(Date.now() / 1000),
        text: "no username",
      },
    };
    const client = makeClient({
      getUpdates: vi.fn().mockResolvedValue([update]),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.messages[0]?.from).toBe("Dima K");
  });

  it("skips a live update whose message has neither text nor caption", async () => {
    patchEnv({
      SERGEANT_OPS_CHAT_ID: "-1001",
      TELEGRAM_TOPIC_OPS: "42",
      OPENCLAW_TELEGRAM_FETCH_UPDATES: true,
    });
    const update: TelegramUpdate = {
      update_id: 1,
      message: {
        message_id: 502,
        message_thread_id: 42,
        chat: { id: -1001, type: "supergroup" },
        date: Math.floor(Date.now() / 1000),
      },
    };
    const client = makeClient({
      getUpdates: vi.fn().mockResolvedValue([update]),
    });

    const result = await readTelegramTopicHistory(
      makePool([]),
      { topic: "ops" },
      { telegramClient: client },
    );

    expect(result.messages).toHaveLength(0);
    expect(result.origin).toBe("archive");
  });
});

describe("readTelegramTopicHistory — default client resolution (no `deps` argument)", () => {
  // Every test above passes `deps.telegramClient` explicitly. These target
  // the `else` branch that lazily builds a client from
  // `env.SERGEANT_ALERT_BOT_TOKEN` when no third argument is given at all.
  it("builds a real client from SERGEANT_ALERT_BOT_TOKEN and completes archive-only when SERGEANT_OPS_CHAT_ID is unset", async () => {
    patchEnv({ SERGEANT_ALERT_BOT_TOKEN: "fake-bot-token" });
    const pool = makePool([
      makeArchiveRow({ message_id: 100, sent_at: "2026-05-13T10:00:00.000Z" }),
    ]);

    // No third `deps` argument — exercises the lazy env-based client build.
    const result = await readTelegramTopicHistory(pool, { topic: "ops" });

    expect(result.origin).toBe("archive");
    expect(result.messages).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it("leaves the client null (archive-only) when SERGEANT_ALERT_BOT_TOKEN is unset", async () => {
    patchEnv({ SERGEANT_ALERT_BOT_TOKEN: "" });
    const pool = makePool([
      makeArchiveRow({ message_id: 100, sent_at: "2026-05-13T10:00:00.000Z" }),
    ]);

    const result = await readTelegramTopicHistory(pool, { topic: "ops" });

    expect(result.origin).toBe("archive");
    expect(result.messages).toHaveLength(1);
  });
});
