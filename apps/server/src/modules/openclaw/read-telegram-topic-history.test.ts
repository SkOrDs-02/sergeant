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
  TelegramForbiddenError,
  TelegramRateLimitError,
  type TelegramBotClient,
  type TelegramUpdate,
} from "../telegram/index.js";

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
});
