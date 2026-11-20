import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSyncStreamConsumer,
  parseSseFrames,
  SYNC_STREAM_DISABLED_RETRY_MS,
  SYNC_STREAM_EVICTED_RETRY_MS,
  SYNC_STREAM_HEALTHY_MS,
  SYNC_STREAM_RECONNECT_MIN_MS,
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

/** Стрім, що віддав кадри й обірвався мережею (як iOS у фоні чи деплой). */
function droppedSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.error(new TypeError("network error"));
    },
  });
  return new Response(body, { status: 200 });
}

function harness(fetchImpl: typeof fetch, opts: { now?: () => number } = {}) {
  const timers: Array<{ handler: () => void; ms: number; live: boolean }> = [];
  const onSignal = vi.fn();
  const captureException = vi.fn();
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
    captureException,
    ...(opts.now ? { now: opts.now } : {}),
  });
  const fire = (ms: number) => {
    const entry = timers.find((t) => t.live && t.ms === ms);
    if (!entry) throw new Error(`no live timer for ${ms}ms`);
    entry.live = false;
    entry.handler();
  };
  return { consumer, onSignal, captureException, timers, fire };
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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
  it("обрив відкритого стріму не йде в Sentry, а перепідключається", async () => {
    const { consumer, captureException, timers } = harness((async () =>
      droppedSseResponse([
        "event: caught_up\ndata: {}\n\n",
      ])) as unknown as typeof fetch);
    consumer.start();
    await flush();
    expect(captureException).not.toHaveBeenCalled();
    expect(timers.some((t) => t.live)).toBe(true);
    consumer.stop();
  });

  it("помилка підключення офлайн не йде в Sentry, онлайн - іде з міткою transport", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    vi.stubGlobal("navigator", { onLine: false });
    const offline = harness(failing);
    offline.consumer.start();
    await flush();
    expect(offline.captureException).not.toHaveBeenCalled();
    offline.consumer.stop();

    vi.stubGlobal("navigator", { onLine: true });
    const online = harness(failing);
    online.consumer.start();
    await flush();
    expect(online.captureException).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({ scope: "sync-v2-stream", transport: true }),
    );
    online.consumer.stop();
  });

  it("`closed: evicted` відкладає реконект на SYNC_STREAM_EVICTED_RETRY_MS", async () => {
    const { consumer, timers } = harness((async () =>
      sseResponse([
        "event: caught_up\ndata: {}\n\n",
        'event: closed\ndata: {"reason":"evicted"}\n\n',
      ])) as unknown as typeof fetch);
    consumer.start();
    await flush();
    const live = timers.filter((t) => t.live).map((t) => t.ms);
    expect(live).toEqual([SYNC_STREAM_EVICTED_RETRY_MS]);
    consumer.stop();
  });

  it("`closed: shutdown` після здорового стріму - швидкий реконект, короткий стрім нарощує бекоф", async () => {
    const shutdownFrame = 'event: closed\ndata: {"reason":"shutdown"}\n\n';
    const respond = (async () =>
      sseResponse([shutdownFrame])) as unknown as typeof fetch;

    // Перший виклик `now` - момент відкриття, другий - кінець стріму.
    let calls = 0;
    const healthy = harness(respond, {
      now: () => (calls++ === 0 ? 0 : SYNC_STREAM_HEALTHY_MS),
    });
    healthy.consumer.start();
    await flush();
    expect(healthy.timers.filter((t) => t.live).map((t) => t.ms)).toEqual([
      SYNC_STREAM_RECONNECT_MIN_MS,
    ]);
    healthy.consumer.stop();

    const short = harness(respond, { now: () => 0 });
    short.consumer.start();
    await flush();
    expect(short.timers.filter((t) => t.live).map((t) => t.ms)).toEqual([
      SYNC_STREAM_RECONNECT_MIN_MS * 2,
    ]);
    short.consumer.stop();
  });
});
