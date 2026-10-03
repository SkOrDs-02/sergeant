/**
 * Підключення верифікації чисел (ADR-0097) у `chat.ts`: перший хід, тур
 * синтезу без стріму і потоковий тур синтезу. Перевіряється, що (1) звірка
 * бачить рівно те «подане», що бачила модель, (2) відповідь у shadow лишається
 * тією самою, (3) хід із tool-викликами не звіряється, (4) `off` не рахує.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessages: vi.fn(),
  anthropicMessagesStream: vi.fn(),
  recordAnthropicUsage: vi.fn(),
  extractAnthropicText: vi.fn(
    (d: { content?: { type: string; text?: string }[] }) =>
      (d?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
  ),
}));

const { resolveHealthConsentMock } = vi.hoisted(() => ({
  resolveHealthConsentMock: vi.fn(),
}));
vi.mock("../../lib/healthConsent.js", () => ({
  resolveHealthConsent: resolveHealthConsentMock,
}));

import {
  anthropicMessages as _anthropicMessages,
  anthropicMessagesStream as _anthropicMessagesStream,
} from "../../lib/anthropic.js";
import { env } from "../../env.js";
import {
  chatNumberHoldMs,
  chatNumberTokensTotal,
  chatNumberVerifyTotal,
} from "../../obs/metrics.js";
import handler from "./chat.js";
import { __resetChatResponseCache } from "./chatResponseCache.js";

const anthropicMessages = _anthropicMessages as unknown as Mock;
const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;

interface TestRes {
  statusCode: number;
  body: unknown;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

const makeReq = (body: unknown): Request =>
  ({ anthropicKey: "sk-test", body }) as unknown as Request;

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

const textReply = (text: string) => ({
  response: { ok: true, status: 200 },
  data: { content: [{ type: "text", text }] },
});

const setMode = (mode: string) => {
  (env as { CHAT_NUMBER_VERIFY: string }).CHAT_NUMBER_VERIFY = mode;
};

async function outcomes(): Promise<Array<[string, string, number]>> {
  const { values } = await chatNumberVerifyTotal.get();
  return values.map((v) => [
    String(v.labels["turn"]),
    String(v.labels["outcome"]),
    v.value,
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
  anthropicMessages.mockReset();
  anthropicMessagesStream.mockReset();
  resolveHealthConsentMock.mockReset();
  resolveHealthConsentMock.mockResolvedValue(true);
  __resetChatResponseCache();
  chatNumberVerifyTotal.reset();
  chatNumberTokensTotal.reset();
  chatNumberHoldMs.reset();
  setMode("shadow");
});

afterEach(() => {
  setMode("off");
});

const FIRST_TURN_BODY = {
  context: "Кава цього тижня: 960 грн",
  messages: [
    {
      role: "user",
      content: "Скільки я витратив на каву? Минулого разу було 1500 грн",
    },
    { role: "assistant", content: "Минулого тижня 780 грн" },
    { role: "user", content: "А цього тижня?" },
  ],
};

describe("перший хід", () => {
  it("число з контексту, питань і попередніх відповідей пояснене, вигадане - ні", async () => {
    anthropicMessages.mockResolvedValueOnce(
      textReply(
        "Цього тижня 960 грн, минулого 780 грн, питав про 1500 грн. Ще 4500 грн на таксі.",
      ),
    );
    const res = makeRes();
    await handler(makeReq(FIRST_TURN_BODY), res);

    expect(await outcomes()).toEqual([["first", "mismatch", 1]]);
    const tokens = Object.fromEntries(
      (await chatNumberTokensTotal.get()).values.map((v) => [
        `${v.labels["kind"]}/${v.labels["explained"]}`,
        v.value,
      ]),
    );
    expect(tokens).toEqual({ "money/given": 3, "money/none": 1 });
  });

  it("відповідь людині та сама: shadow текст не чіпає", async () => {
    const answer = "Цього тижня 960 грн, ще 4500 грн на таксі.";

    setMode("off");
    anthropicMessages.mockResolvedValueOnce(textReply(answer));
    const off = makeRes();
    await handler(makeReq(FIRST_TURN_BODY), off);
    expect(await outcomes()).toEqual([]);

    __resetChatResponseCache();
    setMode("shadow");
    anthropicMessages.mockResolvedValueOnce(textReply(answer));
    const shadow = makeRes();
    await handler(makeReq(FIRST_TURN_BODY), shadow);

    expect(shadow.statusCode).toBe(off.statusCode);
    expect(shadow.body).toEqual(off.body);
    expect(shadow.body).toEqual({ text: answer });
    expect(await outcomes()).toEqual([["first", "mismatch", 1]]);
  });

  it("хід із tool-викликами не звіряється, навіть якщо в тексті є число", async () => {
    anthropicMessages.mockResolvedValueOnce({
      response: { ok: true, status: 200 },
      data: {
        content: [
          { type: "text", text: "Записую 4500 грн…" },
          {
            type: "tool_use",
            id: "toolu_01",
            name: "delete_transaction",
            input: { tx_id: "m_abc" },
          },
        ],
      },
    });
    await handler(makeReq(FIRST_TURN_BODY), makeRes());
    expect(await outcomes()).toEqual([]);
  });

  it("off: нічого не рахується", async () => {
    setMode("off");
    anthropicMessages.mockResolvedValueOnce(textReply("Ще 4500 грн."));
    await handler(makeReq(FIRST_TURN_BODY), makeRes());
    expect(await outcomes()).toEqual([]);
  });
});

const SYNTHESIS_BODY = {
  context: "Бюджет на місяць: 30000 грн",
  messages: [{ role: "user", content: "Покажи витрати за липень" }],
  tool_calls_raw: [
    {
      type: "tool_use",
      id: "toolu_1",
      name: "aggregate_spending",
      input: { month: "2026-07" },
    },
  ],
  tool_results: [
    {
      tool_use_id: "toolu_1",
      content: "продукти 8420 грн, транспорт 1310 грн",
    },
  ],
};

describe("тур синтезу без стріму", () => {
  it("подане: контекст, результат інструмента, питання; усе інше - розбіжність", async () => {
    anthropicMessages.mockResolvedValueOnce(
      textReply(
        "Продукти 8420 грн, бюджет 30000 грн, транспорт 1310 грн, а ще 9999 грн.",
      ),
    );
    const res = makeRes();
    await handler(makeReq(SYNTHESIS_BODY), res);

    expect(res.statusCode).toBe(200);
    expect(await outcomes()).toEqual([["synthesis", "mismatch", 1]]);
  });

  it("усі числа з результату інструмента: ok, відповідь без змін", async () => {
    const answer = "Продукти 8420 грн і транспорт 1310 грн, разом 9730 грн.";
    anthropicMessages.mockResolvedValueOnce(textReply(answer));
    const res = makeRes();
    await handler(makeReq(SYNTHESIS_BODY), res);

    expect(res.body).toEqual({ text: answer });
    expect(await outcomes()).toEqual([["synthesis", "ok", 1]]);
  });

  it("довгий результат усікається, але числа з голови й хвоста лишаються поданими", async () => {
    anthropicMessages.mockResolvedValueOnce(
      textReply("Продукти 8420 грн і транспорт 1310 грн."),
    );
    const big = `продукти 8420 грн; ${"рядок ".repeat(500)} транспорт 1310 грн`;
    await handler(
      makeReq({
        ...SYNTHESIS_BODY,
        tool_results: [{ tool_use_id: "toolu_1", content: big }],
      }),
      makeRes(),
    );
    const sent = anthropicMessages.mock.calls[0]![1] as {
      messages: Array<{ content: unknown }>;
    };
    expect(JSON.stringify(sent.messages)).toMatch(/truncated \d+ chars/);
    expect(await outcomes()).toEqual([["synthesis", "ok", 1]]);
  });

  it("off: нічого не рахується", async () => {
    setMode("off");
    anthropicMessages.mockResolvedValueOnce(textReply("Ще 4500 грн."));
    await handler(makeReq(SYNTHESIS_BODY), makeRes());
    expect(await outcomes()).toEqual([]);
  });
});

describe("тур синтезу зі стрімом", () => {
  const { Response: NodeResponse, ReadableStream: NodeReadableStream } =
    globalThis;

  function upstream(text: string): globalThis.Response {
    const encoder = new TextEncoder();
    const events = [
      { type: "content_block_delta", delta: { type: "text_delta", text } },
      { type: "message_delta", delta: { stop_reason: "end_turn" } },
    ];
    const stream = new NodeReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""),
          ),
        );
        controller.close();
      },
    });
    return new NodeResponse(stream, { status: 200 });
  }

  function makeSseRes() {
    const writes: string[] = [];
    let ended = false;
    const res = {
      writes,
      setHeader() {},
      write(s: string) {
        writes.push(s);
        return true;
      },
      end() {
        ended = true;
      },
      get writableEnded() {
        return ended;
      },
    };
    return res as unknown as typeof res & Response;
  }

  async function runStream(text: string): Promise<string[]> {
    anthropicMessagesStream.mockReset();
    anthropicMessagesStream.mockResolvedValue({
      response: upstream(text),
      recordStreamEnd: vi.fn(),
    });
    const res = makeSseRes();
    await handler(makeReq({ ...SYNTHESIS_BODY, stream: true }), res);
    return res.writes;
  }

  it("подане те саме, що й без стріму; фрейми не залежать від режиму", async () => {
    const text = "Продукти 8420 грн, бюджет 30000 грн, а ще 9999 грн.";

    setMode("off");
    const baseline = await runStream(text);
    expect(await outcomes()).toEqual([]);

    setMode("shadow");
    const shadow = await runStream(text);
    expect(shadow).toEqual(baseline);
    expect(await outcomes()).toEqual([["synthesis", "mismatch", 1]]);
  });
});
