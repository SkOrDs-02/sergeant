import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { lookupWhois } from "./whois.js";
import {
  type TelegramBotClient,
  type TelegramChat,
  TelegramApiError,
  TelegramForbiddenError,
  TelegramRateLimitError,
} from "../telegram/index.js";

/**
 * Unit-tests для `/openclaw whois` aggregator-у (PR /whois).
 *
 * Pure SQL-shape + DI-mock checks: ані Bot API, ані pg.Pool не
 * стартуються. Fail-soft матриця fully covered — Telegram getChat
 * 403/429/api_error, missing founder mute-row, empty invocations.
 */

interface RecordedCall {
  text: string;
  values: unknown[];
}

function makeFakePool(
  responseMap: Array<{ matcher: RegExp; rows: Record<string, unknown>[] }>,
): { pool: Pool; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const pool = {
    async query(text: string, values: unknown[]) {
      calls.push({ text, values });
      for (const r of responseMap) {
        if (r.matcher.test(text))
          return { rows: r.rows, rowCount: r.rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as Pool;
  return { pool, calls };
}

function makeClient(
  fn: (chatId: string | number) => Promise<TelegramChat>,
): TelegramBotClient {
  return {
    getChat: vi.fn(fn),
    getUpdates: vi.fn(async () => []),
  };
}

describe("lookupWhois — happy path (numeric id, no client)", () => {
  it("queries invocations + tools + skips telegram + mute-only-for-founder", async () => {
    const { pool, calls } = makeFakePool([
      {
        matcher: /MAX\(invoked_at\)/,
        rows: [
          { count: "12", last_seen: new Date("2026-05-13T19:00:00.000Z") },
        ],
      },
      {
        matcher: /jsonb_array_elements/,
        rows: [
          { tool: "recall_memory", count: "5" },
          { tool: "list_memories", count: "3" },
        ],
      },
    ]);
    const result = await lookupWhois(pool, {
      tgUserId: 123456,
      founderTgUserId: 999,
      founderUserId: "user-1",
    });
    expect(result.tgUserId).toBe(123456);
    expect(result.resolvedFrom).toBe("numeric");
    expect(result.isFounder).toBe(false);
    expect(result.inAllowlist).toBe(false);
    expect(result.invocations7d).toBe(12);
    expect(result.lastSeenIso).toBe("2026-05-13T19:00:00.000Z");
    expect(result.topTools).toEqual([
      { tool: "recall_memory", count: 5 },
      { tool: "list_memories", count: 3 },
    ]);
    expect(result.muteState).toBeNull();
    expect(result.telegramError).toBeNull();
    // 2 invocation-rollup queries; 0 mute queries (not founder).
    expect(calls).toHaveLength(2);
  });
});

describe("lookupWhois — founder match → mute lookup", () => {
  it("queries mute-state row when tg-id matches founderTgUserId", async () => {
    const { pool, calls } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
      {
        matcher: /SELECT founder_user_id, muted_until, set_at, reason/,
        rows: [
          {
            founder_user_id: "user-1",
            muted_until: new Date("2026-05-14T05:00:00.000Z"),
            set_at: new Date("2026-05-13T22:00:00.000Z"),
            reason: "deep-work",
          },
        ],
      },
    ]);
    const result = await lookupWhois(pool, {
      tgUserId: 999,
      founderTgUserId: 999,
      founderUserId: "user-1",
    });
    expect(result.isFounder).toBe(true);
    expect(result.inAllowlist).toBe(true);
    expect(result.muteState).not.toBeNull();
    expect(result.muteState?.mutedUntilIso).toBe("2026-05-14T05:00:00.000Z");
    expect(result.muteState?.reason).toBe("deep-work");
    // Last query → mute SELECT (3rd).
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[2]?.text).toMatch(/openclaw_mute_state/);
    expect(calls[2]?.values).toEqual(["user-1"]);
  });
});

describe("lookupWhois — username resolution via Bot API", () => {
  it("calls getChat with @username and uses returned numeric id", async () => {
    const client = makeClient(async (chatId) => {
      expect(chatId).toBe("@dmytrostakhov");
      return {
        id: 42424242,
        type: "private",
        username: "dmytrostakhov",
        first_name: "Dmytro",
        last_name: "Stakhov",
      } as unknown as TelegramChat;
    });
    const { pool } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    const result = await lookupWhois(pool, {
      username: "dmytrostakhov",
      founderTgUserId: 999,
      founderUserId: "user-1",
      telegramClient: client,
    });
    expect(result.tgUserId).toBe(42424242);
    expect(result.resolvedFrom).toBe("username");
    expect(result.username).toBe("dmytrostakhov");
    expect(result.firstName).toBe("Dmytro");
    expect(result.lastName).toBe("Stakhov");
    expect(result.telegramError).toBeNull();
  });

  it("strips leading @ before passing to getChat", async () => {
    const client = makeClient(async (chatId) => {
      expect(chatId).toBe("@foo");
      return {
        id: 1,
        type: "private",
        username: "foo",
      } as unknown as TelegramChat;
    });
    const { pool } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    await lookupWhois(pool, {
      username: "@foo",
      founderTgUserId: 0,
      founderUserId: "user-1",
      telegramClient: client,
    });
  });
});

describe("lookupWhois — Telegram fail-soft", () => {
  it("maps TelegramRateLimitError to telegramError.code=rate_limit", async () => {
    const client = makeClient(async () => {
      throw new TelegramRateLimitError("getChat", "Too many requests", 42);
    });
    const { pool } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    const result = await lookupWhois(pool, {
      tgUserId: 123,
      founderTgUserId: 0,
      founderUserId: "user-1",
      telegramClient: client,
    });
    expect(result.telegramError?.code).toBe("rate_limit");
    expect(result.telegramError?.retryAfter).toBe(42);
    // Fallback to numeric id stays usable.
    expect(result.tgUserId).toBe(123);
  });

  it("maps TelegramForbiddenError to telegramError.code=forbidden", async () => {
    const client = makeClient(async () => {
      throw new TelegramForbiddenError(
        "getChat",
        403,
        "Forbidden: bot was blocked by the user",
      );
    });
    const { pool } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    const result = await lookupWhois(pool, {
      tgUserId: 123,
      founderTgUserId: 0,
      founderUserId: "user-1",
      telegramClient: client,
    });
    expect(result.telegramError?.code).toBe("forbidden");
  });

  it("maps 'chat not found' to telegramError.code=not_found", async () => {
    const client = makeClient(async () => {
      throw new TelegramApiError("getChat", 400, "Bad Request: chat not found");
    });
    const { pool } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    const result = await lookupWhois(pool, {
      username: "ghost",
      founderTgUserId: 0,
      founderUserId: "user-1",
      telegramClient: client,
    });
    expect(result.telegramError?.code).toBe("not_found");
    // Username path → still tgUserId=0 sentinel оскільки resolution failed.
    expect(result.tgUserId).toBe(0);
  });

  it("never throws on numeric-only lookup without a client", async () => {
    const { pool } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    const result = await lookupWhois(pool, {
      tgUserId: 555,
      founderTgUserId: 0,
      founderUserId: "user-1",
    });
    expect(result.telegramError).toBeNull();
    expect(result.username).toBeNull();
  });
});

describe("lookupWhois — SQL shape sanity", () => {
  it("filters by founder_tg_user_id::bigint with $1, sinceIso with $2", async () => {
    const { pool, calls } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    await lookupWhois(pool, {
      tgUserId: 123456,
      founderTgUserId: 0,
      founderUserId: "user-1",
      windowDays: 14,
    });
    const summary = calls[0];
    if (!summary) throw new Error("missing summary call");
    expect(summary.text).toMatch(/WHERE founder_tg_user_id = \$1::bigint/);
    expect(summary.text).toMatch(/AND invoked_at >= \$2::timestamptz/);
    expect(summary.values[0]).toBe(123456);
    expect(typeof summary.values[1]).toBe("string");
    expect(summary.values[1] as string).toMatch(/Z$/);

    const tools = calls[1];
    if (!tools) throw new Error("missing tools call");
    expect(tools.text).toMatch(/LATERAL jsonb_array_elements\(tool_calls\)/);
    expect(tools.text).toMatch(/LIMIT \$3/);
  });

  it("clamps topToolsLimit into [1, 20]", async () => {
    const { pool, calls } = makeFakePool([
      { matcher: /MAX\(invoked_at\)/, rows: [{ count: "0", last_seen: null }] },
      { matcher: /jsonb_array_elements/, rows: [] },
    ]);
    await lookupWhois(pool, {
      tgUserId: 1,
      founderTgUserId: 0,
      founderUserId: "user-1",
      topToolsLimit: 999,
    });
    expect(calls[1]?.values[2]).toBe(20);
  });
});
