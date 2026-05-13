import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "grammy";
import {
  handleStrategy,
  registerStrategyCommands,
} from "./handler-strategy-commands.js";
import { parseStrategyCommand } from "./strategy-format.js";
import type { HandlerContext } from "./handler-context.js";

/**
 * Integration tests for `/strategy` slash-command handler.
 *
 * - `handleStrategy` — direct dispatcher invocation з мок-fetch-ом
 *   (швидко, без grammy).
 * - `registerStrategyCommands` — end-to-end через fake `bot` що ловить
 *   `bot.command(...)`-handler і запускає його з фейковим Context-ом.
 *   Перевіряємо audit-row-и (open + finalize), DM-allowlist gate і
 *   rate-limit-gate.
 */

interface FetchCall {
  url: string;
  method: string | undefined;
  body: unknown;
}

function makeFetchMock(responses: Record<string, () => Response>): {
  fn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method, body });
    const factory = responses[url];
    if (!factory) {
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }
    return factory();
  }) as unknown as typeof fetch;
  return { fn, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const SERVER_URL = "http://test-server";
const API_KEY = "test-key";
const FOUNDER = "user_1";

describe("handleStrategy — dispatcher", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("/strategy list → POSTs to /strategic/list with founderUserId + status filter", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/list`]: () =>
        jsonResponse({
          ok: true,
          goals: [
            {
              id: 7,
              persona: "finyk",
              founderUserId: FOUNDER,
              weekStart: "2026-05-11",
              goalText: "Cut coffee 60%",
              status: "active",
              createdAt: "2026-05-11T08:00:00Z",
              updatedAt: "2026-05-11T08:00:00Z",
            },
          ],
        }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("list active");
    if (parsed.kind === "help" || parsed.kind === "error") {
      throw new Error("expected list command");
    }
    const reply = await handleStrategy(parsed, {
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({
      founderUserId: FOUNDER,
      status: "active",
    });
    expect(reply).toContain("finyk");
    expect(reply).toContain("#7");
    expect(reply).toContain("Cut coffee 60%");
  });

  it("/strategy list all → omits status param (no filter)", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/list`]: () =>
        jsonResponse({ ok: true, goals: [] }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("list all");
    if (parsed.kind !== "list") throw new Error("expected list");
    await handleStrategy(parsed, {
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
    });
    expect(calls[0]!.body).toEqual({ founderUserId: FOUNDER });
  });

  it("/strategy add finyk: text → POSTs to /strategic/goals with current Kyiv-Monday", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/goals`]: () =>
        jsonResponse({
          ok: true,
          goal: {
            id: 99,
            persona: "finyk",
            founderUserId: FOUNDER,
            weekStart: "2026-05-11",
            goalText: "Cut coffee 60%",
            status: "active",
            createdAt: "2026-05-11T08:00:00Z",
            updatedAt: "2026-05-11T08:00:00Z",
          },
        }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("add finyk: Cut coffee 60%");
    if (parsed.kind !== "add") throw new Error("expected add");
    const reply = await handleStrategy(parsed, {
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      persona: "finyk",
      founderUserId: FOUNDER,
      goalText: "Cut coffee 60%",
    });
    expect((calls[0]!.body as { weekStart: string }).weekStart).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(reply).toContain("#99");
    expect(reply).toContain("Cut coffee 60%");
  });

  it("/strategy done <id> → POSTs status=achieved", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/goals/status`]: () =>
        jsonResponse({
          ok: true,
          goal: {
            id: 42,
            persona: "fizruk",
            founderUserId: FOUNDER,
            weekStart: "2026-05-11",
            goalText: "Squat 5x5",
            status: "achieved",
            createdAt: "2026-05-11T08:00:00Z",
            updatedAt: "2026-05-12T08:00:00Z",
          },
        }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("done 42");
    if (parsed.kind !== "done") throw new Error("expected done");
    const reply = await handleStrategy(parsed, {
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
    });
    expect(calls[0]!.body).toEqual({ id: 42, status: "achieved" });
    expect(reply).toContain("achieved");
    expect(reply).toContain("#42");
  });

  it("/strategy abandon <id> → POSTs status=abandoned", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/goals/status`]: () =>
        jsonResponse({
          ok: true,
          goal: {
            id: 8,
            persona: "routine",
            founderUserId: FOUNDER,
            weekStart: "2026-05-11",
            goalText: "Wake at 06:30",
            status: "abandoned",
            createdAt: "2026-05-11T08:00:00Z",
            updatedAt: "2026-05-12T08:00:00Z",
          },
        }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("abandon 8");
    if (parsed.kind !== "abandon") throw new Error("expected abandon");
    await handleStrategy(parsed, {
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
    });
    expect(calls[0]!.body).toEqual({ id: 8, status: "abandoned" });
  });

  it("/strategy carry <id> → POSTs to /goals/carry", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/goals/carry`]: () =>
        jsonResponse({
          ok: true,
          goal: {
            id: 11,
            persona: "nutrition",
            founderUserId: FOUNDER,
            weekStart: "2026-05-18",
            goalText: "Drink 2L water",
            status: "carried_over",
            createdAt: "2026-05-11T08:00:00Z",
            updatedAt: "2026-05-12T08:00:00Z",
          },
        }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("carry 11");
    if (parsed.kind !== "carry") throw new Error("expected carry");
    const reply = await handleStrategy(parsed, {
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
    });
    expect(calls[0]!.body).toEqual({ id: 11 });
    expect(reply).toContain("carried");
    expect(reply).toContain("2026-05-18");
  });

  it("throws when API returns ok:false", async () => {
    const { fn } = makeFetchMock({
      [`${SERVER_URL}/api/internal/strategic/goals/status`]: () =>
        jsonResponse({ ok: false, error: "update_failed" }),
    });
    globalThis.fetch = fn;

    const parsed = parseStrategyCommand("done 999");
    if (parsed.kind !== "done") throw new Error("expected done");
    await expect(
      handleStrategy(parsed, {
        serverUrl: SERVER_URL,
        internalApiKey: API_KEY,
        founderUserId: FOUNDER,
      }),
    ).rejects.toThrow(/update_failed/);
  });
});

// ─── End-to-end: bot.command wiring ──────────────────────────────────────

interface FakeCommandHandler {
  (c: FakeContext): Promise<unknown> | unknown;
}

interface FakeBot {
  command: ReturnType<typeof vi.fn>;
  handlers: Map<string, FakeCommandHandler>;
}

interface FakeContext {
  match?: string;
  from?: { id: number };
  chat?: { id: number; type: string };
  reply: ReturnType<typeof vi.fn>;
}

function makeFakeBot(): FakeBot {
  const handlers = new Map<string, FakeCommandHandler>();
  const command = vi.fn((name: string, handler: FakeCommandHandler) => {
    handlers.set(name, handler);
  });
  return { command, handlers } as unknown as FakeBot;
}

function makeCtx(overrides: Partial<FakeContext> = {}): FakeContext {
  return {
    match: "",
    from: { id: 555 },
    chat: { id: 123, type: "private" },
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("registerStrategyCommands — bot wiring", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function registerWith(
    bot: FakeBot,
    opts: { allowDm?: boolean; rateLimitAllow?: boolean } = {},
  ): void {
    const ctx = {
      bot: bot as unknown as Bot,
      serverUrl: SERVER_URL,
      internalApiKey: API_KEY,
      founderUserId: FOUNDER,
      rateLimiter: { allow: () => opts.rateLimitAllow ?? true },
      isAllowedDmContext: () => opts.allowDm ?? true,
    } as unknown as HandlerContext;
    registerStrategyCommands(ctx);
  }

  it("registers /strategy command on the bot", () => {
    const bot = makeFakeBot();
    registerWith(bot);
    expect(bot.command).toHaveBeenCalledWith("strategy", expect.any(Function));
    expect(bot.handlers.has("strategy")).toBe(true);
  });

  it("opens + finalizes audit invocation around /strategy list", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/openclaw/invocations/open`]: () =>
        jsonResponse({ invocationId: 7 }),
      [`${SERVER_URL}/api/internal/strategic/list`]: () =>
        jsonResponse({ ok: true, goals: [] }),
      [`${SERVER_URL}/api/internal/openclaw/invocations/finalize`]: () =>
        jsonResponse({ ok: true }),
    });
    globalThis.fetch = fn;

    const bot = makeFakeBot();
    registerWith(bot);
    const ctx = makeCtx({ match: "list active" });
    await bot.handlers.get("strategy")!(ctx);

    const urls = calls.map((c) => c.url);
    expect(urls).toContain(
      `${SERVER_URL}/api/internal/openclaw/invocations/open`,
    );
    expect(urls).toContain(`${SERVER_URL}/api/internal/strategic/list`);
    expect(urls).toContain(
      `${SERVER_URL}/api/internal/openclaw/invocations/finalize`,
    );

    const finalizeCall = calls.find((c) =>
      c.url.endsWith("/invocations/finalize"),
    )!;
    expect(finalizeCall.body).toMatchObject({
      invocationId: 7,
      status: "success",
    });

    // Open-call carries subcommand metadata for downstream audit-querying.
    const openCall = calls.find((c) => c.url.endsWith("/invocations/open"))!;
    expect(openCall.body).toMatchObject({
      founderUserId: FOUNDER,
      trigger: "dm",
      metadata: expect.objectContaining({ subcommand: "list" }),
    });
    expect(ctx.reply).toHaveBeenCalled();
  });

  it("finalizes audit with status=error when downstream API fails", async () => {
    const { fn, calls } = makeFetchMock({
      [`${SERVER_URL}/api/internal/openclaw/invocations/open`]: () =>
        jsonResponse({ invocationId: 11 }),
      [`${SERVER_URL}/api/internal/strategic/goals/status`]: () =>
        jsonResponse({ ok: false, error: "update_failed" }),
      [`${SERVER_URL}/api/internal/openclaw/invocations/finalize`]: () =>
        jsonResponse({ ok: true }),
    });
    globalThis.fetch = fn;

    const bot = makeFakeBot();
    registerWith(bot);
    const ctx = makeCtx({ match: "done 99" });
    await bot.handlers.get("strategy")!(ctx);

    const finalizeCall = calls.find((c) =>
      c.url.endsWith("/invocations/finalize"),
    )!;
    expect(finalizeCall.body).toMatchObject({
      invocationId: 11,
      status: "error",
    });
    // User-facing error reply (not HTML-parse-mode).
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining("Не зміг"));
  });

  it("silently rejects /strategy when DM-allowlist fails", async () => {
    const { fn, calls } = makeFetchMock({});
    globalThis.fetch = fn;

    const bot = makeFakeBot();
    registerWith(bot, { allowDm: false });
    const ctx = makeCtx({ match: "list" });
    await bot.handlers.get("strategy")!(ctx);

    expect(calls).toHaveLength(0);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("replies rate-limit message and skips work when rate-limiter denies", async () => {
    const { fn, calls } = makeFetchMock({});
    globalThis.fetch = fn;

    const bot = makeFakeBot();
    registerWith(bot, { rateLimitAllow: false });
    const ctx = makeCtx({ match: "list" });
    await bot.handlers.get("strategy")!(ctx);

    expect(calls).toHaveLength(0);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringMatching(/Rate limit/));
  });

  it("renders help on empty argument without fetching", async () => {
    const { fn, calls } = makeFetchMock({});
    globalThis.fetch = fn;

    const bot = makeFakeBot();
    registerWith(bot);
    const ctx = makeCtx({ match: "" });
    await bot.handlers.get("strategy")!(ctx);

    expect(calls).toHaveLength(0);
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("/strategy"),
      expect.objectContaining({ parse_mode: "HTML" }),
    );
  });
});
