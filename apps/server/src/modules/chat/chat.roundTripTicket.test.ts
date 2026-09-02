/**
 * AI-5 рішення 1 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`)
 * — handler-level: перевіряє, що `round_trip_ticket` приклеюється до
 * `tool_calls`-відповіді, коли сесія відома, і що цей квиток дійсно
 * приймається `consumeRoundTripTicket` для того самого userId.
 *
 * Окремий файл (не `chat.test.ts`), бо тут — на відміну від решти
 * handler-тестів — потрібен мокнутий `../../auth.js` із реальним
 * `sessionUser.id`; решта `chat.test.ts` навмисно лишає сесію
 * незамоканою (`getSessionUser` кидає → `.catch(() => null)` → анонім).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(() => ""),
}));

vi.mock("../../auth.js", () => ({
  getSessionUser: vi.fn(async () => ({ id: "u-ticket-1" })),
}));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";
import { consumeRoundTripTicket } from "./chatRoundTripTicket.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

function makeReq(body: unknown): Request {
  return { anthropicKey: "sk-test", body } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  __resetChatResponseCache();
});

describe("chat handler — round_trip_ticket attachment (AI-5)", () => {
  it("приклеює round_trip_ticket до tool_calls-відповіді, коли сесія відома", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [
          {
            type: "tool_use",
            id: "toolu_01ABC",
            name: "mark_habit_done",
            input: { habit_id: "hab_1" },
          },
        ],
      },
    });

    const req = makeReq({
      messages: [{ role: "user", content: "Відміть звичку" }],
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      tool_calls?: unknown;
      round_trip_ticket?: string;
    };
    expect(Array.isArray(body.tool_calls)).toBe(true);
    expect(typeof body.round_trip_ticket).toBe("string");
    expect(body.round_trip_ticket!.length).toBeGreaterThan(10);

    // Квиток реально валідний для юзера, якому його видали — не декоративний рядок.
    expect(
      consumeRoundTripTicket({
        ticket: body.round_trip_ticket!,
        userId: "u-ticket-1",
      }),
    ).toBe(true);
  });

  it("НЕ додає round_trip_ticket, коли перший тур не повернув tool_calls", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Привіт!" }] },
    });

    const req = makeReq({
      messages: [{ role: "user", content: "Привіт" }],
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { round_trip_ticket?: string };
    expect(body.round_trip_ticket).toBeUndefined();
  });
});
