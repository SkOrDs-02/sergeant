/**
 * Тур синтезу БЕЗ стріму на порожню відповідь моделі (`chatSynthesisJson.ts`,
 * доручення власника 2026-11-19 закрити пункт техборгу). Раніше хендлер
 * віддавав `{ text: "Готово." }` як нібито відповідь і не повертав квоту.
 * Тепер поведінка та сама, що в стрімі: один перезапит без міркувань через
 * шлюз, інакше повернення квоти й 502 `ANTHROPIC_ERROR`.
 *
 * Мокається лише HTTP-межа (`lib/anthropic.js`), гейт згоди і звірка чисел.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
vi.mock("./numberVerify/shadow.js", () => ({ shadowVerifyNumbers: vi.fn() }));

import { anthropicMessages as _anthropicMessages } from "../../lib/anthropic.js";
import { env } from "../../env.js";
import { ExternalServiceError } from "../../obs/errors.js";
import { register } from "../../obs/metrics.js";
import { shadowVerifyNumbers as _shadow } from "./numberVerify/shadow.js";
import handler from "./chat.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const shadowMock = _shadow as unknown as Mock;

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

const TOOL_CALL = {
  type: "tool_use",
  id: "toolu_1",
  name: "delete_transaction",
  input: { tx_id: "m_abc" },
};

function synthesisReq(body: Record<string, unknown> = {}) {
  const aiQuotaRefund = vi.fn().mockResolvedValue(undefined);
  const req = {
    anthropicKey: "sk-test",
    aiQuotaRefund,
    body: {
      messages: [{ role: "user", content: "Видали m_abc" }],
      tool_calls_raw: [TOOL_CALL],
      tool_results: [{ tool_use_id: "toolu_1", content: "видалено" }],
      ...body,
    },
  } as unknown as Request;
  return { req, aiQuotaRefund };
}

/** Модель «подумала» відповідь і не дала жодного текстового блока. */
const THINKING_ONLY = {
  response: { ok: true, status: 200 },
  data: {
    content: [{ type: "thinking", thinking: "Видалено 540 грн" }],
    stop_reason: "end_turn",
  },
};
const TEXT_ANSWER = {
  response: { ok: true, status: 200 },
  data: { content: [{ type: "text", text: "Видалив." }] },
};

async function retryCount(outcome: string): Promise<number> {
  const metric = await register
    .getSingleMetric("chat_synthesis_empty_retry_total")
    ?.get();
  return (
    metric?.values.find((v) => v.labels["outcome"] === outcome)?.value ?? 0
  );
}

beforeEach(() => {
  anthropicMessages.mockReset();
  shadowMock.mockReset();
  vi.stubEnv("CHAT_VIA_OPENROUTER", "true");
  vi.stubEnv("OPENROUTER_API_KEY", "or-test");
  (env as { CHAT_SYNTHESIS_EMPTY_RETRY: string }).CHAT_SYNTHESIS_EMPTY_RETRY =
    "on";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("JSON synthesis turn — empty model answer", () => {
  it("empty → one retry without reasoning → text in 200, quota kept, verify on final text", async () => {
    const before = await retryCount("recovered");
    anthropicMessages
      .mockResolvedValueOnce(THINKING_ONLY)
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req, aiQuotaRefund } = synthesisReq();
    const res = makeRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: "Видалив." });
    expect(aiQuotaRefund).not.toHaveBeenCalled();
    expect(anthropicMessages).toHaveBeenCalledTimes(2);
    const [, first, firstOpts] = anthropicMessages.mock.calls[0]!;
    const [, retry, retryOpts] = anthropicMessages.mock.calls[1]!;
    expect(retry).toMatchObject({ thinking: { type: "disabled" } });
    expect(retry).not.toHaveProperty("output_config");
    expect(retry.messages).toEqual(first.messages);
    // Usage кожного виклику пише `anthropicMessages` під своїм ендпоінтом.
    expect(firstOpts).toMatchObject({ endpoint: "chat-tool-result" });
    expect(retryOpts).toMatchObject({
      endpoint: "chat-tool-result-retry",
      allowOpenRouter: true,
    });
    expect(shadowMock).toHaveBeenCalledTimes(1);
    expect(shadowMock.mock.calls[0]![0]).toMatchObject({
      turn: "synthesis",
      answer: "Видалив.",
    });
    expect(await retryCount("recovered")).toBe(before + 1);
  });

  it("both attempts empty → no «Готово.», 502, quota refunded, exactly one retry", async () => {
    const before = await retryCount("still_empty");
    anthropicMessages
      .mockResolvedValueOnce(THINKING_ONLY)
      .mockResolvedValueOnce(THINKING_ONLY)
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req, aiQuotaRefund } = synthesisReq();
    const res = makeRes();

    const err = await handler(req, res).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err).toMatchObject({ status: 502, code: "ANTHROPIC_ERROR" });
    expect(res.body).toBeUndefined();
    expect(aiQuotaRefund).toHaveBeenCalledTimes(1);
    expect(anthropicMessages).toHaveBeenCalledTimes(2);
    expect(shadowMock).not.toHaveBeenCalled();
    expect(await retryCount("still_empty")).toBe(before + 1);
  });

  it("retry throws → 502, quota refunded, counted as error", async () => {
    const before = await retryCount("error");
    anthropicMessages
      .mockResolvedValueOnce(THINKING_ONLY)
      .mockRejectedValueOnce(new Error("socket hang up"));
    const { req, aiQuotaRefund } = synthesisReq();

    const err = await handler(req, makeRes()).catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 502, code: "ANTHROPIC_ERROR" });
    expect(aiQuotaRefund).toHaveBeenCalledTimes(1);
    expect(await retryCount("error")).toBe(before + 1);
  });

  it("direct Anthropic (no gateway) → no retry, no stub, quota refunded", async () => {
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");
    anthropicMessages
      .mockResolvedValueOnce(THINKING_ONLY)
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req, aiQuotaRefund } = synthesisReq();
    const res = makeRes();

    const err = await handler(req, res).catch((e: unknown) => e);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ status: 502, code: "ANTHROPIC_ERROR" });
    expect(res.body).toBeUndefined();
    expect(aiQuotaRefund).toHaveBeenCalledTimes(1);
  });

  it("kill switch off → no retry, no stub, quota refunded", async () => {
    (env as { CHAT_SYNTHESIS_EMPTY_RETRY: string }).CHAT_SYNTHESIS_EMPTY_RETRY =
      "off";
    anthropicMessages
      .mockResolvedValueOnce(THINKING_ONLY)
      .mockResolvedValueOnce(TEXT_ANSWER);
    const { req, aiQuotaRefund } = synthesisReq();

    const err = await handler(req, makeRes()).catch((e: unknown) => e);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ status: 502, code: "ANTHROPIC_ERROR" });
    expect(aiQuotaRefund).toHaveBeenCalledTimes(1);
  });

  it("text on the first attempt → no retry, plain 200", async () => {
    anthropicMessages.mockResolvedValueOnce(TEXT_ANSWER);
    const { req, aiQuotaRefund } = synthesisReq();
    const res = makeRes();

    await handler(req, res);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ text: "Видалив." });
    expect(aiQuotaRefund).not.toHaveBeenCalled();
  });
});

describe("first turn — empty text next to tool_use stays legitimate", () => {
  it("tool_use without text → tool_calls with text: null, no retry, no refund", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: { content: [TOOL_CALL], stop_reason: "tool_use" },
    });
    const aiQuotaRefund = vi.fn().mockResolvedValue(undefined);
    const req = {
      anthropicKey: "sk-test",
      aiQuotaRefund,
      body: { messages: [{ role: "user", content: "Видали m_first" }] },
    } as unknown as Request;
    const res = makeRes();

    await handler(req, res);

    expect(anthropicMessages).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      text: null,
      tool_calls: [{ id: "toolu_1", name: "delete_transaction" }],
    });
    expect(aiQuotaRefund).not.toHaveBeenCalled();
  });
});
