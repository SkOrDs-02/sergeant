/**
 * Верифікація чисел (ADR-0097) у потоковому турі синтезу: shadow рахує метрики
 * на повному тексті, але фрейми, які бачить клієнт, лишаються байт-у-байт
 * тими самими, що й без звірки.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Mock } from "vitest";

vi.mock("../../lib/anthropic.js", () => ({
  anthropicMessagesStream: vi.fn(),
  recordAnthropicUsage: vi.fn(),
}));

import { anthropicMessagesStream as _anthropicMessagesStream } from "../../lib/anthropic.js";
import { env } from "../../env.js";
import {
  chatNumberHoldMs,
  chatNumberTokensTotal,
  chatNumberVerifyTotal,
} from "../../obs/metrics.js";
import { streamAnthropicToSse } from "./chatStream.js";
import type { GivenSources } from "./numberVerify/givenCorpus.js";

const anthropicMessagesStream = _anthropicMessagesStream as unknown as Mock;

const {
  Response: NodeResponse,
  ReadableStream: NodeReadableStream,
  TextEncoder: NodeTextEncoder,
} = globalThis;

interface SseEvent {
  type: string;
  delta?: { type?: string; text?: string; stop_reason?: string };
  [key: string]: unknown;
}

function upstream(events: SseEvent[]): globalThis.Response {
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

function textEvents(...chunks: string[]): SseEvent[] {
  return [
    ...chunks.map((text) => ({
      type: "content_block_delta",
      delta: { type: "text_delta", text },
    })),
    { type: "message_delta", delta: { stop_reason: "end_turn" } },
  ];
}

interface SseRes {
  writes: string[];
  setHeader(k: string, v: string): void;
  write(s: string): boolean;
  end(): void;
  readonly writableEnded: boolean;
}

function makeSseRes(): SseRes & Response {
  const writes: string[] = [];
  let ended = false;
  const res: SseRes = {
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
  };
  return res as unknown as SseRes & Response;
}

const PAYLOAD = {
  model: "claude-test",
  messages: [{ role: "user", content: "Скільки на каву?" }],
};

const GIVEN: GivenSources = {
  contexts: ["Кава цього тижня: 960 грн"],
  userMessages: ["Скільки на каву?"],
};

const MISMATCH_CHUNKS = ["Кава: 960 грн, ", "а ще **4500 грн** на таксі."];
const OK_CHUNKS = ["Кава: ", "960 грн."];

/** Прогін стріму з власним upstream; повертає все, що записано клієнту. */
async function run(
  chunks: string[],
  given: (() => GivenSources) | undefined,
  events: SseEvent[] = textEvents(...chunks),
): Promise<string[]> {
  anthropicMessagesStream.mockReset();
  anthropicMessagesStream.mockResolvedValue({
    response: upstream(events),
    recordStreamEnd: vi.fn(),
  });
  const res = makeSseRes();
  await streamAnthropicToSse(
    {} as Request,
    res,
    "k",
    PAYLOAD,
    "chat-tool-result",
    undefined,
    undefined,
    undefined,
    undefined,
    given,
  );
  return (res as unknown as SseRes).writes;
}

const setMode = (mode: string) => {
  (env as { CHAT_NUMBER_VERIFY: string }).CHAT_NUMBER_VERIFY = mode;
};

async function verifyTotals(): Promise<
  Array<[Record<string, unknown>, number]>
> {
  const { values } = await chatNumberVerifyTotal.get();
  return values.map((v) => [v.labels, v.value]);
}

beforeEach(() => {
  chatNumberVerifyTotal.reset();
  chatNumberTokensTotal.reset();
  chatNumberHoldMs.reset();
});

afterEach(() => {
  setMode("off");
});

describe("потоковий синтез: shadow не змінює фрейми", () => {
  it("розбіжне число: фрейми ті самі, що без звірки, метрика mismatch", async () => {
    setMode("off");
    const baseline = await run(MISMATCH_CHUNKS, undefined);
    expect(await verifyTotals()).toEqual([]);

    setMode("shadow");
    const shadow = await run(MISMATCH_CHUNKS, () => GIVEN);

    expect(shadow.join("")).toBe(baseline.join(""));
    expect(shadow).toEqual(baseline);
    // Саме ті фрейми, які й мав побачити клієнт: дельти й завершення.
    expect(shadow).toEqual([
      `data: ${JSON.stringify({ t: MISMATCH_CHUNKS[0] })}\n\n`,
      `data: ${JSON.stringify({ t: MISMATCH_CHUNKS[1] })}\n\n`,
      "data: [DONE]\n\n",
    ]);
    expect(await verifyTotals()).toEqual([
      [{ turn: "synthesis", mode: "shadow", outcome: "mismatch" }, 1],
    ]);
  });

  it("звірка йде на повному тексті туру, а не на окремій дельті", async () => {
    setMode("shadow");
    // Число розрізане між дельтами: на жодній окремо його не видно.
    await run(["Кава: 96", "0 грн."], () => GIVEN);
    expect(await verifyTotals()).toEqual([
      [{ turn: "synthesis", mode: "shadow", outcome: "ok" }, 1],
    ]);
  });

  it("enforce до PR3 поводиться як shadow: фрейми ті самі, mode=shadow", async () => {
    setMode("off");
    const baseline = await run(MISMATCH_CHUNKS, undefined);
    setMode("enforce");
    const enforced = await run(MISMATCH_CHUNKS, () => GIVEN);
    expect(enforced).toEqual(baseline);
    expect((await verifyTotals()).map(([l]) => l["mode"])).toEqual(["shadow"]);
  });

  it("off: фрейми ті самі, подане не збирається, метрик немає", async () => {
    const given = vi.fn(() => GIVEN);
    setMode("off");
    const frames = await run(MISMATCH_CHUNKS, given);
    expect(frames).toHaveLength(3);
    expect(given).not.toHaveBeenCalled();
    expect(await verifyTotals()).toEqual([]);
    expect((await chatNumberTokensTotal.get()).values).toEqual([]);
  });

  it("без numberVerifyGiven звірки немає й у shadow", async () => {
    setMode("shadow");
    await run(OK_CHUNKS, undefined);
    expect(await verifyTotals()).toEqual([]);
  });

  it("збій звірки не чіпає потік: фрейми й [DONE] на місці", async () => {
    setMode("off");
    const baseline = await run(OK_CHUNKS, undefined);
    setMode("shadow");
    const frames = await run(OK_CHUNKS, () => {
      throw new Error("подане не зібралось");
    });
    expect(frames).toEqual(baseline);
    expect(await verifyTotals()).toEqual([
      [{ turn: "synthesis", mode: "shadow", outcome: "error" }, 1],
    ]);
  });

  it("обірваний стрім (event: error) не звіряється", async () => {
    setMode("shadow");
    const frames = await run([], () => GIVEN, [
      {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Кава: 4500 грн" },
      },
      { type: "error", error: { type: "overloaded", message: "x" } },
    ]);
    expect(frames.some((f) => f.includes("err"))).toBe(true);
    expect(await verifyTotals()).toEqual([]);
  });
});
