/**
 * Другий раунд інструментів «пошук → запис» (С-2 (б), спека
 * `docs/work/specs/hubchat-second-tool-round.md`, `chatSecondRound.ts`).
 *
 * Мокається лише HTTP-межа (`lib/anthropic.js`), гейт згоди, налаштування
 * модулів і звірка чисел.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../lib/anthropic.js")>();
  return {
    anthropicMessages: vi.fn(),
    anthropicMessagesStream: vi.fn(),
    extractAnthropicText: actual.extractAnthropicText,
  };
});
vi.mock("../../lib/healthConsent.js", () => ({
  resolveHealthConsent: vi.fn().mockResolvedValue(true),
}));
vi.mock("../me/dataRights.js", () => ({
  getUserPreferences: vi.fn().mockResolvedValue({ activeModules: null }),
}));
vi.mock("./numberVerify/shadow.js", () => ({ shadowVerifyNumbers: vi.fn() }));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import { env } from "../../env.js";
import handler from "./chat.js";
import {
  isSecondRoundEligible,
  pickSecondRoundWrites,
} from "./chatSecondRound.js";
import {
  __resetRoundTripTickets,
  issueRoundTripTicket,
  redeemRoundTripTicket,
} from "./chatRoundTripTicket.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function makeRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as TestRes & Response;
}

const FIND = {
  type: "tool_use",
  id: "toolu_find",
  name: "find_transaction",
  input: { query: "кава" },
};
const FIND_RESULT = {
  tool_use_id: "toolu_find",
  content: "Знайдено 1 операц.: m_7c41: 2026-07-30 · 85 грн · кава",
};
const CHANGE = {
  type: "tool_use",
  id: "toolu_change",
  name: "delete_transaction",
  input: { tx_id: "m_7c41" },
};

function synthesisReq(body: Record<string, unknown> = {}, paidRound?: 1 | 2) {
  const aiQuotaRefund = vi.fn().mockResolvedValue(undefined);
  const req = {
    anthropicKey: "sk-test",
    aiQuotaRefund,
    user: { id: "u-second-round" },
    // Те, що ставить `assertAiQuota`, коли погасив квиток (`aiQuota.ts`).
    ...(paidRound ? { aiRoundTripRound: paidRound } : {}),
    body: {
      messages: [{ role: "user", content: "Видали ту каву за 85 грн" }],
      tool_calls_raw: [FIND],
      tool_results: [FIND_RESULT],
      second_tool_round: true,
      ...body,
    },
  } as unknown as Request;
  return { req, aiQuotaRefund };
}

const ok = (content: unknown[]) => ({
  response: { ok: true, status: 200 },
  data: { content },
});
const TEXT_ANSWER = ok([{ type: "text", text: "Знайшов каву за 85 грн." }]);

beforeEach(() => {
  anthropicMessages.mockReset();
  __resetRoundTripTickets();
  (env as { CHAT_SECOND_TOOL_ROUND: string }).CHAT_SECOND_TOOL_ROUND = "on";
});

describe("isSecondRoundEligible", () => {
  it("лише пошук → так; читання, запис чи порожньо → ні", () => {
    expect(isSecondRoundEligible([FIND])).toBe(true);
    expect(
      isSecondRoundEligible([
        { type: "tool_use", id: "a", name: "aggregate_spending", input: {} },
      ]),
    ).toBe(false);
    expect(isSecondRoundEligible([FIND, CHANGE])).toBe(false);
    expect(isSecondRoundEligible([])).toBe(false);
  });

  it("вимикач off знімає раунд", () => {
    (env as { CHAT_SECOND_TOOL_ROUND: string }).CHAT_SECOND_TOOL_ROUND = "off";
    expect(isSecondRoundEligible([FIND])).toBe(false);
  });
});

describe("pickSecondRoundWrites", () => {
  it("приймає лише запис і в межах стелі", () => {
    expect(pickSecondRoundWrites([CHANGE], 7)).toEqual([CHANGE]);
    expect(pickSecondRoundWrites([FIND], 7)).toBeNull();
    expect(pickSecondRoundWrites([CHANGE, FIND], 7)).toBeNull();
    expect(pickSecondRoundWrites([{ type: "text", text: "?" }], 7)).toBeNull();
    expect(pickSecondRoundWrites([CHANGE, CHANGE], 1)).toBeNull();
  });
});

describe("chat handler — другий раунд", () => {
  it("пошук → модель обрала запис: виклики запису й квиток другого раунду", async () => {
    anthropicMessages.mockResolvedValueOnce(
      ok([{ type: "text", text: "Видаляю." }, CHANGE]),
    );
    const firstTicket = "6f1c3c1e-4b7a-4d2a-9c1e-1a2b3c4d5e6f";
    const { req, aiQuotaRefund } = synthesisReq(
      { round_trip_ticket: firstTicket },
      1,
    );
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const { round_trip_ticket: ticket, ...rest } = res.body as {
      round_trip_ticket?: string;
    };
    expect(rest).toEqual({
      text: "Видаляю.",
      tool_calls: [
        { id: "toolu_change", name: "delete_transaction", input: CHANGE.input },
      ],
      tool_calls_raw: [{ type: "text", text: "Видаляю." }, CHANGE],
    });
    // Трейс ходу той самий; квиток позначено другим раундом (AI-5).
    expect(ticket).toBe(firstTicket);
    expect(
      redeemRoundTripTicket({ ticket: ticket!, userId: "u-second-round" }),
    ).toBe(2);
    expect(aiQuotaRefund).not.toHaveBeenCalled();
    expect(anthropicMessages).toHaveBeenCalledTimes(1);

    const [, payload, opts] = anthropicMessages.mock.calls[0]!;
    expect(opts).toMatchObject({ endpoint: "chat-second-round" });
    expect(payload.model).toBe(env.CHAT_MODEL_FIRST_TURN);
    const toolNames = (payload.tools as Array<{ name: string }>).map(
      (t) => t.name,
    );
    expect(toolNames).toContain("delete_transaction");
    expect(toolNames).toContain("change_category");
    expect(toolNames).toContain("find_transaction");
    expect(toolNames).not.toContain("aggregate_spending");
    expect(toolNames).not.toContain("query_transactions");
    // Історія + виклик пошуку + його результат.
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[1]).toEqual({ role: "assistant", content: [FIND] });
    expect(payload.messages[2].role).toBe("user");
  });

  it("модель не обрала запис → звичайний синтез, текст другого раунду відкидається", async () => {
    anthropicMessages
      .mockResolvedValueOnce(ok([{ type: "text", text: "Яку з двох?" }]))
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req } = synthesisReq();
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: "Знайшов каву за 85 грн." });
    expect(anthropicMessages).toHaveBeenCalledTimes(2);
    expect(anthropicMessages.mock.calls[1]![2]).toMatchObject({
      endpoint: "chat-tool-result",
    });
  });

  it("модель у другому раунді знову читає → третього раунду немає, синтез", async () => {
    anthropicMessages
      .mockResolvedValueOnce(ok([{ ...FIND, id: "toolu_find2" }]))
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req } = synthesisReq();
    const res = makeRes();

    await handler(req, res);

    expect(res.body).toEqual({ text: "Знайшов каву за 85 грн." });
    expect(anthropicMessages).toHaveBeenCalledTimes(2);
  });

  it("збій моделі в другому раунді не валить хід і не повертає квоту", async () => {
    anthropicMessages
      .mockResolvedValueOnce({
        response: { ok: false, status: 500 },
        data: { error: { message: "boom" } },
      })
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req, aiQuotaRefund } = synthesisReq();
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: "Знайшов каву за 85 грн." });
    expect(aiQuotaRefund).not.toHaveBeenCalled();
  });

  it("запит синтезу після другого раунду (пошук + запис) іде прямо в синтез", async () => {
    anthropicMessages.mockResolvedValueOnce(TEXT_ANSWER);
    const { req } = synthesisReq({
      tool_calls_raw: [FIND, CHANGE],
      tool_results: [
        FIND_RESULT,
        { tool_use_id: "toolu_change", content: "Видалено" },
      ],
    });
    const res = makeRes();

    await handler(req, res);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]![2]).toMatchObject({
      endpoint: "chat-tool-result",
    });
  });

  it("читання без пошуку другого раунду не отримує", async () => {
    anthropicMessages.mockResolvedValueOnce(TEXT_ANSWER);
    const { req } = synthesisReq({
      tool_calls_raw: [
        {
          type: "tool_use",
          id: "toolu_agg",
          name: "aggregate_spending",
          input: {},
        },
      ],
      tool_results: [{ tool_use_id: "toolu_agg", content: "Разом 540 грн" }],
    });
    const res = makeRes();

    await handler(req, res);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]![2]).toMatchObject({
      endpoint: "chat-tool-result",
    });
  });

  it("старий клієнт без second_tool_round: звичайний синтез, як до зміни", async () => {
    anthropicMessages.mockResolvedValueOnce(TEXT_ANSWER);
    const { req } = synthesisReq({ second_tool_round: undefined });
    const res = makeRes();

    await handler(req, res);

    expect(res.body).toEqual({ text: "Знайшов каву за 85 грн." });
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]![2]).toMatchObject({
      endpoint: "chat-tool-result",
    });
  });

  it("запит, оплачений квитком другого раунду, третього раунду не отримує", async () => {
    anthropicMessages.mockResolvedValueOnce(TEXT_ANSWER);
    // Підроблений «пошук» з квитком другого раунду.
    const { req } = synthesisReq({}, 2);
    const res = makeRes();

    await handler(req, res);

    expect(res.body).toEqual({ text: "Знайшов каву за 85 грн." });
    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(anthropicMessages.mock.calls[0]![2]).toMatchObject({
      endpoint: "chat-tool-result",
    });
  });
});

describe("квиток другого раунду", () => {
  it("одноразовий: повтор того самого квитка відхиляється", () => {
    const ticket = issueRoundTripTicket({ userId: "u-1", round: 2 });
    expect(redeemRoundTripTicket({ ticket, userId: "u-1" })).toBe(2);
    expect(redeemRoundTripTicket({ ticket, userId: "u-1" })).toBeNull();
  });

  it("без позначки квиток першого ходу", () => {
    const ticket = issueRoundTripTicket({ userId: "u-1" });
    expect(redeemRoundTripTicket({ ticket, userId: "u-1" })).toBe(1);
  });
});
