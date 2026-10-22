import { describe, expect, it, vi } from "vitest";

import {
  createSyncStreamConsumer,
  parseSseFrames,
  SYNC_STREAM_DISABLED_RETRY_MS,
  SYNC_STREAM_SIGNAL_DEBOUNCE_MS,
} from "./syncStreamConsumer";

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status });
}

function harness(fetchImpl: typeof fetch) {
  const timers: Array<{ handler: () => void; ms: number; live: boolean }> = [];
  const onSignal = vi.fn();
  const consumer = createSyncStreamConsumer({
    url: "/api/v2/sync/stream",
    originDeviceId: "dev-1",
    getSince: async () => 42,
    onSignal,
    fetch: fetchImpl,
    setTimeout: (handler, ms) => {
      const entry = { handler, ms, live: true };
      timers.push(entry);
      return entry;
    },
    clearTimeout: (handle) => {
      (handle as { live: boolean }).live = false;
    },
    random: () => 1,
  });
  const fire = (ms: number) => {
    const entry = timers.find((t) => t.live && t.ms === ms);
    if (!entry) throw new Error(`no live timer for ${ms}ms`);
    entry.live = false;
    entry.handler();
  };
  return { consumer, onSignal, timers, fire };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("parseSseFrames", () => {
  it("розбирає кадри, пропускає heartbeat і лишає неповний хвіст", () => {
    const { frames, rest } = parseSseFrames(
      ': heartbeat\n\nevent: op\ndata: {"id":1}\n\nevent: caught_up\ndata: {"id":1}\n\nevent: op\nda',
    );
    expect(frames.map((f) => f.event)).toEqual(["op", "caught_up"]);
    expect(frames[0]?.data).toBe('{"id":1}');
    expect(rest).toBe("event: op\nda");
  });

  it("приймає CRLF", () => {
    const { frames } = parseSseFrames("event: op\r\ndata: x\r\n\r\n");
    expect(frames).toEqual([{ event: "op", data: "x" }]);
  });
});

describe("createSyncStreamConsumer", () => {
  it("шле since з курсора та X-Origin-Device-Id", async () => {
    const fetchMock = vi.fn(async () => sseResponse([]));
    const { consumer } = harness(fetchMock as unknown as typeof fetch);
    consumer.start();
    await flush();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v2/sync/stream?since=42");
    expect((init.headers as Record<string, string>)["X-Origin-Device-Id"]).toBe(
      "dev-1",
    );
    expect(init.credentials).toBe("include");
    consumer.stop();
  });

  it("живий op після caught_up дає один дебаунснутий сигнал", async () => {
    const { consumer, onSignal, fire } = harness((async () =>
      sseResponse([
        "event: hello\ndata: {}\n\n",
        "event: caught_up\ndata: {}\n\n",
        'event: op\ndata: {"id":5}\n\nevent: op\ndata: {"id":6}\n\n',
      ])) as unknown as typeof fetch);
    consumer.start();
    await flush();
    expect(onSignal).not.toHaveBeenCalled();
    fire(SYNC_STREAM_SIGNAL_DEBOUNCE_MS);
    expect(onSignal).toHaveBeenCalledTimes(1);
    consumer.stop();
  });

  it("backlog до caught_up дає один сигнал, а не по кадру", async () => {
    const { consumer, onSignal, timers, fire } = harness((async () =>
      sseResponse([
        'event: op\ndata: {"id":1}\n\nevent: op\ndata: {"id":2}\n\n',
        "event: caught_up\ndata: {}\n\n",
      ])) as unknown as typeof fetch);
    consumer.start();
    await flush();
    expect(
      timers.filter((t) => t.ms === SYNC_STREAM_SIGNAL_DEBOUNCE_MS),
    ).toHaveLength(1);
    fire(SYNC_STREAM_SIGNAL_DEBOUNCE_MS);
    expect(onSignal).toHaveBeenCalledTimes(1);
    consumer.stop();
  });

  it("404 (прапорець вимкнено) відкладає спробу надовго без сигналів", async () => {
    const { consumer, onSignal, timers } = harness(
      (async () =>
        new Response("nf", { status: 404 })) as unknown as typeof fetch,
    );
    consumer.start();
    await flush();
    expect(timers.some((t) => t.ms === SYNC_STREAM_DISABLED_RETRY_MS)).toBe(
      true,
    );
    expect(onSignal).not.toHaveBeenCalled();
    consumer.stop();
  });

  it("після закриття стріму перепідключається, stop() гасить усе", async () => {
    const fetchMock = vi.fn(async () => sseResponse([]));
    const { consumer, timers } = harness(fetchMock as unknown as typeof fetch);
    consumer.start();
    await flush();
    const reconnect = timers.find((t) => t.live);
    expect(reconnect).toBeDefined();
    consumer.stop();
    expect(timers.every((t) => !t.live)).toBe(true);
    reconnect?.handler();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
