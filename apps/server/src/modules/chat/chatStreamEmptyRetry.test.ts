/**
 * Страховка-перезапит порожнього туру синтезу (`chatStreamEmptyRetry.ts`,
 * рішення власника 2026-11-19): стрім синтезу через шлюз закрився успішно без
 * жодного символу тексту → рівно один перезапит без міркувань у ту саму
 * SSE-відповідь. Мокається лише HTTP-межа (`lib/anthropic.js`).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessagesStream: vi.fn(),
  recordAnthropicUsage: vi.fn(),
}));
vi.mock("./numberVerify/shadow.js", () => ({ shadowVerifyNumbers: vi.fn() }));

import {
  anthropicMessagesStream as _anthropicMessagesStream,
  recordAnthropicUsage as _recordAnthropicUsage,
} from "../../lib/anthropic.js";
import { env } from "../../env.js";
import { register } from "../../obs/metrics.js";
import { streamAnthropicToSse } from "./chatStream.js";
import type { GivenSources } from "./numberVerify/givenCorpus.js";
import {
  synthesisToolChoiceFields,
  withoutReasoning,
} from "./chatStreamEmptyRetry.js";
import { shadowVerifyNumbers as _shadow } from "./numberVerify/shadow.js";

const {
  Response: NodeResponse,
  ReadableStream: NodeReadableStream,
  TextEncoder: NodeTextEncoder,
} = globalThis;
if (!NodeResponse || !NodeReadableStream || !NodeTextEncoder) {
  throw new Error("Node fetch-stack globals missing (need Node >= 18)");
}

const streamMock = _anthropicMessagesStream as unknown as Mock;
const usageMock = _recordAnthropicUsage as unknown as Mock;
const shadowMock = _shadow as unknown as Mock;

type Ev = Record<string, unknown>;

function upstream(events: Ev[]): globalThis.Response {
  const encoder = new NodeTextEncoder();
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  const stream = new NodeReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  });
  return new NodeResponse(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Модель «подумала» відповідь і закрила стрім без текстового блока. */
const THINKING_ONLY: Ev[] = [
  { type: "message_start", message: { usage: { input_tokens: 0 } } },
  {
    type: "content_block_delta",
    delta: { type: "thinking_delta", thinking: "Відповідь: 540 грн" },
  },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { input_tokens: 900, output_tokens: 120, cost: 0.0004 },
  },
];

const TEXT_ANSWER: Ev[] = [
  { type: "content_block_delta", delta: { type: "text_delta", text: "Ок" } },
  {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { input_tokens: 900, output_tokens: 20, cost: 0.0002 },
  },
];

function stub(events: Ev[]) {
  return { response: upstream(events), recordStreamEnd: vi.fn() };
}

function makeRes(): Response & { writes: string[] } {
  const writes: string[] = [];
  let ended = false;
  return {
    writes,
    setHeader() {},
    write(s: string) {
      if (ended) return false;
      writes.push(s);
      return true;
    },
    end() {
      ended = true;
    },
    get writableEnded() {
      return ended;
    },
  } as unknown as Response & { writes: string[] };
}

function frames(writes: string[]): string[] {
  return writes
    .filter((w) => w.startsWith("data: "))
    .map((w) => w.slice("data: ".length).replace(/\n\n$/, ""));
}

const GENERIC_ERR = JSON.stringify({ err: "Сержант тимчасово недоступний" });

const PAYLOAD = {
  model: "deepseek/deepseek-v4-flash",
  max_tokens: 2500,
  output_config: { effort: "low" },
  messages: [{ role: "user", content: "скільки витратив?" }],
};

async function retryCount(outcome: string): Promise<number> {
  const metric = await register
    .getSingleMetric("chat_synthesis_empty_retry_total")
    ?.get();
  const row = metric?.values.find((v) => v.labels["outcome"] === outcome);
  return row?.value ?? 0;
}

async function run(
  opts: {
    signal?: AbortSignal;
    given?: () => GivenSources;
    fallback?: string;
  } = {},
) {
  const refund = vi.fn().mockResolvedValue(undefined);
  const req = { aiQuotaRefund: refund } as unknown as Request;
  const res = makeRes();
  await streamAnthropicToSse(
    req,
    res,
    "sk-test",
    PAYLOAD,
    "chat-tool-result",
    opts.signal,
    undefined,
    undefined,
    undefined,
    opts.given,
    opts.fallback,
  );
  return { refund, res };
}

beforeEach(() => {
  streamMock.mockReset();
  usageMock.mockReset();
  shadowMock.mockReset();
  vi.stubEnv("CHAT_VIA_OPENROUTER", "true");
  vi.stubEnv("OPENROUTER_API_KEY", "or-test");
  (env as { CHAT_SYNTHESIS_EMPTY_RETRY: string }).CHAT_SYNTHESIS_EMPTY_RETRY =
    "on";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("withoutReasoning", () => {
  it("drops output_config and disables thinking, keeps the rest", () => {
    expect(withoutReasoning(PAYLOAD)).toEqual({
      model: PAYLOAD.model,
      max_tokens: 2500,
      messages: PAYLOAD.messages,
      thinking: { type: "disabled" },
    });
  });
});

describe("synthesisToolChoiceFields", () => {
  it("на шлюзі забороняє новий виклик інструмента, на прямому Anthropic порожньо", () => {
    vi.stubEnv("CHAT_VIA_OPENROUTER", "true");
    expect(synthesisToolChoiceFields()).toEqual({
      tool_choice: { type: "none" },
    });
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");
    expect(synthesisToolChoiceFields()).toEqual({});
  });
});

describe("streamAnthropicToSse — empty synthesis retry", () => {
  it("(а) thinking-only answer → one retry without reasoning, client gets text, no error, quota kept", async () => {
    const before = await retryCount("recovered");
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(TEXT_ANSWER));

    const { refund, res } = await run({ given: () => ({}) as GivenSources });

    expect(streamMock).toHaveBeenCalledTimes(2);
    // Звірка чисел іде по фінальному тексту перезапиту.
    expect(shadowMock).toHaveBeenCalledTimes(1);
    expect(shadowMock.mock.calls[0]![0]).toMatchObject({
      turn: "synthesis",
      answer: "Ок",
    });
    const [, retryPayload, retryOpts] = streamMock.mock.calls[1]!;
    expect(retryPayload).toMatchObject({ thinking: { type: "disabled" } });
    expect(retryPayload).not.toHaveProperty("output_config");
    expect(retryPayload.messages).toEqual(PAYLOAD.messages);
    expect(retryOpts).toMatchObject({
      endpoint: "chat-tool-result-retry",
      allowOpenRouter: true,
    });
    expect(frames(res.writes)).toEqual([JSON.stringify({ t: "Ок" }), "[DONE]"]);
    expect(refund).not.toHaveBeenCalled();
    // Вартість обох викликів: порожня спроба теж оплачена.
    expect(usageMock).toHaveBeenCalledTimes(2);
    expect(usageMock.mock.calls.map((c) => c[1])).toEqual([
      "chat-tool-result",
      "chat-tool-result-retry",
    ]);
    expect(await retryCount("recovered")).toBe(before + 1);
  });

  it("(б) retry is empty too → existing branch: refund + generic err, exactly one retry", async () => {
    const before = await retryCount("still_empty");
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(TEXT_ANSWER));

    const { refund, res } = await run();

    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(frames(res.writes)).toEqual([GENERIC_ERR, "[DONE]"]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await retryCount("still_empty")).toBe(before + 1);
  });

  it("(б2) empty after retry + fallback → deterministic text, quota kept, no err", async () => {
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(THINKING_ONLY));

    const { refund, res } = await run({
      fallback: "Запамʼятав: Не їсть глютен",
    });

    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(frames(res.writes)).toEqual([
      JSON.stringify({ t: "Запамʼятав: Не їсть глютен" }),
      "[DONE]",
    ]);
    expect(refund).not.toHaveBeenCalled();
  });

  it("retry call throws → refund + one generic err, counted as error", async () => {
    const before = await retryCount("error");
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockRejectedValueOnce(new Error("socket hang up"));

    const { refund, res } = await run();

    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(frames(res.writes)).toEqual([GENERIC_ERR, "[DONE]"]);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await retryCount("error")).toBe(before + 1);
  });

  it("(в) direct Anthropic (no gateway) → no retry", async () => {
    vi.stubEnv("CHAT_VIA_OPENROUTER", "false");
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(TEXT_ANSWER));

    const { refund, res } = await run();

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(frames(res.writes)).toEqual([GENERIC_ERR, "[DONE]"]);
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("(г) kill switch off → no retry", async () => {
    (env as { CHAT_SYNTHESIS_EMPTY_RETRY: string }).CHAT_SYNTHESIS_EMPTY_RETRY =
      "off";
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(TEXT_ANSWER));

    const { refund, res } = await run();

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(frames(res.writes)).toEqual([GENERIC_ERR, "[DONE]"]);
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("(д) aborted request → no retry", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    streamMock
      .mockResolvedValueOnce(stub(THINKING_ONLY))
      .mockResolvedValueOnce(stub(TEXT_ANSWER));

    await run({ signal: ctrl.signal });

    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it("text on the first attempt → no retry", async () => {
    streamMock.mockResolvedValueOnce(stub(TEXT_ANSWER));

    const { res } = await run();

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(frames(res.writes)).toEqual([JSON.stringify({ t: "Ок" }), "[DONE]"]);
  });
});
