/**
 * Ініціатива 0025, Фаза 2 — trace-дерево chat tool-loop.
 *
 * Перевіряє, що `round_trip_ticket`, виданий наприкінці першого туру,
 * реально йде як `$ai_trace_id`:
 *   1. у виклик Anthropic першого туру (`traceId` в опціях);
 *   2. назад у виклик Anthropic tool-result-туру (той самий ticket, echo
 *      від клієнта);
 *   3. у `$ai_span` для кожного виконаного tool-а (`captureAiSpan`).
 *
 * Окремий файл (не `chat.test.ts`/`chat.roundTripTicket.test.ts`), бо тут
 * потрібен і `req.user` (як у `chat.roundTripTicket.test.ts`), і мок
 * `posthogAi.js` — жоден з існуючих файлів не поєднує обидва.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
  ),
}));

const captureAiSpanMock = vi.hoisted(() =>
  vi.fn((_input: Record<string, unknown>) => true),
);
vi.mock("../../lib/posthogAi.js", () => ({
  captureAiSpan: captureAiSpanMock,
}));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";
import { __resetChatToolSpanTimingForTests } from "./chatToolSpanTiming.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

function makeReq(body: unknown): Request {
  return {
    anthropicKey: "sk-test",
    body,
    user: { id: "u-span-1" },
  } as unknown as Request;
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
  __resetChatToolSpanTimingForTests();
});

describe("chat handler — $ai_trace_id / $ai_span на tool-loop (0025 Фаза 2)", () => {
  it("тримає один traceId через turn1 → round_trip_ticket → turn2 → $ai_span", async () => {
    // Turn 1 — модель пропонує tool_use.
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

    const req1 = makeReq({
      messages: [{ role: "user", content: "Відміть звичку" }],
    });
    const res1 = makeRes();
    await handler(req1, res1);

    expect(res1.statusCode).toBe(200);
    const body1 = res1.body as { round_trip_ticket?: string };
    const ticket = body1.round_trip_ticket;
    expect(typeof ticket).toBe("string");

    // traceId, переданий у turn-1 виклик Anthropic, — той самий ticket.
    const turn1Opts = anthropicMessages.mock.calls[0]![2] as {
      traceId?: string;
    };
    expect(turn1Opts.traceId).toBe(ticket);

    // Turn 2 — клієнт виконав tool і повертає результат разом з квитком.
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Готово." }] },
    });

    const req2 = makeReq({
      messages: [{ role: "user", content: "Відміть звичку" }],
      tool_calls_raw: [
        {
          type: "tool_use",
          id: "toolu_01ABC",
          name: "mark_habit_done",
          input: { habit_id: "hab_1" },
        },
      ],
      tool_results: [{ tool_use_id: "toolu_01ABC", content: "ok" }],
      round_trip_ticket: ticket,
    });
    const res2 = makeRes();
    await handler(req2, res2);

    expect(res2.statusCode).toBe(200);

    // Той самий traceId пішов у tool-result-генерацію (другий Anthropic-виклик).
    const turn2Opts = anthropicMessages.mock.calls[1]![2] as {
      traceId?: string;
    };
    expect(turn2Opts.traceId).toBe(ticket);

    // $ai_span на виконаний tool — та сама $ai_trace_id, правильне імʼя,
    // без помилки (tool_use_id змапився).
    expect(captureAiSpanMock).toHaveBeenCalledTimes(1);
    expect(captureAiSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-span-1",
        traceId: ticket,
        spanName: "mark_habit_done",
        isError: false,
      }),
    );
    // Латентність — округлена оцінка round-trip-у, а не точний вимір per-tool
    // (§ `chatToolSpanTiming.ts`); тут лише перевіряємо, що поле є числом.
    const spanArg = captureAiSpanMock.mock.calls[0]![0] as {
      latencyMs?: number;
    };
    expect(typeof spanArg.latencyMs).toBe("number");
  });

  it("tool_use_id без provenance-мапи → span з isError=true і spanName='unknown'", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [
          {
            type: "tool_use",
            id: "toolu_known",
            name: "mark_habit_done",
            input: { habit_id: "hab_1" },
          },
        ],
      },
    });
    const res1 = makeRes();
    await handler(
      makeReq({ messages: [{ role: "user", content: "Відміть звичку" }] }),
      res1,
    );
    const ticket = (res1.body as { round_trip_ticket?: string })
      .round_trip_ticket!;

    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Готово." }] },
    });

    const res2 = makeRes();
    await handler(
      makeReq({
        messages: [{ role: "user", content: "Відміть звичку" }],
        tool_calls_raw: [
          {
            type: "tool_use",
            id: "toolu_known",
            name: "mark_habit_done",
            input: { habit_id: "hab_1" },
          },
        ],
        // `validateToolCallsRawProvenance` вимагає, щоб КОЖЕН tool_use-блок
        // у `tool_calls_raw` мав відповідник у `tool_results` — не навпаки.
        // Тож зайвий `tool_result` без блоку в `tool_calls_raw` провенанс
        // пропускає (400 тут не буде), а `buildToolUseIdToNameMap` його не
        // змапить — рівно та гілка, яку перевіряємо.
        tool_results: [
          { tool_use_id: "toolu_known", content: "ok" },
          { tool_use_id: "toolu_orphan", content: "ok" },
        ],
        round_trip_ticket: ticket,
      }),
      res2,
    );

    expect(res2.statusCode).toBe(200);
    expect(captureAiSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: ticket,
        spanName: "mark_habit_done",
        isError: false,
      }),
    );
    expect(captureAiSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: ticket,
        spanName: "unknown",
        isError: true,
      }),
    );
  });

  it("підроблений round_trip_ticket не стає traceId — беремо свіжий UUID", async () => {
    // Схема пропускає будь-який рядок до 200 символів, а `assertAiQuota`
    // невалідний квиток просто не зараховує (запит іде далі звичайним
    // списанням). Без перевірки формату клієнт визначав би вміст
    // телеметрійного `$ai_trace_id` і міг би зшити свій хід із чужим
    // деревом — саме це тут і закрито.
    const forged = "not-a-uuid; drop everything";

    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [{ type: "text", text: "Готово." }] },
    });

    const res = makeRes();
    await handler(
      makeReq({
        messages: [{ role: "user", content: "Відміть звичку" }],
        tool_calls_raw: [
          {
            type: "tool_use",
            id: "toolu_known",
            name: "mark_habit_done",
            input: { habit_id: "hab_1" },
          },
        ],
        tool_results: [{ tool_use_id: "toolu_known", content: "ok" }],
        round_trip_ticket: forged,
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(captureAiSpanMock).toHaveBeenCalled();
    for (const [arg] of captureAiSpanMock.mock.calls) {
      expect((arg as { traceId: string }).traceId).not.toBe(forged);
      expect((arg as { traceId: string }).traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });
});
