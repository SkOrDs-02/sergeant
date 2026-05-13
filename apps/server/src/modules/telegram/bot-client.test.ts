import { describe, expect, it, vi } from "vitest";
import {
  createTelegramBotClient,
  TelegramApiError,
  TelegramForbiddenError,
  TelegramRateLimitError,
} from "./bot-client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createTelegramBotClient", () => {
  it("throws when token is empty", () => {
    expect(() => createTelegramBotClient({ token: "" })).toThrow(/token/i);
  });

  it("getChat: parses ok:true envelope and posts to the right URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        ok: true,
        result: { id: -100, type: "supergroup", title: "Ops" },
      }),
    );
    const client = createTelegramBotClient({
      token: "bot-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.getChat("-100");
    expect(result).toMatchObject({
      id: -100,
      type: "supergroup",
      title: "Ops",
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.telegram.org/botbot-token/getChat");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      chat_id: "-100",
    });
  });

  it("getChat: maps 403 ok:false to TelegramForbiddenError", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error_code: 403,
          description: "Forbidden: bot was kicked from the supergroup chat",
        },
        403,
      ),
    );
    const client = createTelegramBotClient({
      token: "bot-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getChat("-100")).rejects.toBeInstanceOf(
      TelegramForbiddenError,
    );
  });

  it("getChat: maps 429 with retry_after to TelegramRateLimitError", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error_code: 429,
          description: "Too Many Requests: retry after 30",
          parameters: { retry_after: 30 },
        },
        429,
      ),
    );
    const client = createTelegramBotClient({
      token: "bot-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await client.getChat("-100");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TelegramRateLimitError);
      expect((err as TelegramRateLimitError).retryAfter).toBe(30);
      expect((err as TelegramRateLimitError).method).toBe("getChat");
    }
  });

  it("getUpdates: passes optional fields, defaults to empty body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: [] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, result: [] }));
    const client = createTelegramBotClient({
      token: "bot-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getUpdates();
    await client.getUpdates({ offset: -100, limit: 50, timeout: 0 });
    const firstBody = JSON.parse(
      String((fetchImpl.mock.calls[0]![1] as RequestInit).body),
    );
    expect(firstBody).toEqual({});
    const secondBody = JSON.parse(
      String((fetchImpl.mock.calls[1]![1] as RequestInit).body),
    );
    expect(secondBody).toEqual({ offset: -100, limit: 50, timeout: 0 });
  });

  it("maps transport-level fetch errors to TelegramApiError with status 0", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const client = createTelegramBotClient({
      token: "bot-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await client.getChat("-100");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TelegramApiError);
      expect((err as TelegramApiError).status).toBe(0);
      expect((err as TelegramApiError).description).toMatch(/ECONNREFUSED/);
    }
  });

  it("maps non-error ok:false with unrecognised error_code to generic TelegramApiError", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error_code: 400,
          description: "Bad Request: chat not found",
        },
        400,
      ),
    );
    const client = createTelegramBotClient({
      token: "bot-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    try {
      await client.getChat("-999");
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TelegramApiError);
      expect(err).not.toBeInstanceOf(TelegramForbiddenError);
      expect(err).not.toBeInstanceOf(TelegramRateLimitError);
      expect((err as TelegramApiError).status).toBe(400);
    }
  });

  it("respects apiBase override (sandbox / proxy)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, result: { id: 1, type: "private" } }),
      );
    const client = createTelegramBotClient({
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiBase: "https://tg.example.test/",
    });
    await client.getChat(1);
    const [url] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://tg.example.test/bott/getChat");
  });
});
