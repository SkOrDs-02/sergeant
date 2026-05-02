// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MAX_BATCH, enqueue, __resetForTests } from "./webVitals";

// apiUrl is a thin wrapper around VITE_API_URL + path; we don't care about
// the exact URL, only that a single call happens per flush.
vi.mock("@shared/lib/apiUrl", () => ({
  apiUrl: (p: string) => `https://api.test${p}`,
}));

function makeMetric(name: string, value: number) {
  return { name, value, rating: "good" as const };
}

async function waitMicrotasks() {
  // flush() is posted via Promise.resolve().then(...). Awaiting twice is
  // enough to let the microtask queue drain, including any reschedule.
  await Promise.resolve();
  await Promise.resolve();
}

describe("webVitals.flush", () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetForTests();
    sendBeaconSpy = vi.fn(() => true);
    fetchSpy = vi.fn(() => Promise.resolve(new Response()));
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });
    // jsdom has no global fetch by default.
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchSpy,
    });
  });

  afterEach(() => {
    __resetForTests();
  });

  it("drains the buffer in ordered batches when more than MAX_BATCH are enqueued in one tick", async () => {
    // Regression: flush used to splice MAX_BATCH off the buffer and leave
    // the tail sitting there because `flushScheduled` was already reset
    // and no one called `scheduleFlush` again — those metrics only went
    // out on the next enqueue or pagehide.
    const total = MAX_BATCH + 3;
    for (let i = 0; i < total; i++) {
      enqueue(makeMetric("LCP", i + 1));
    }

    // The synchronous threshold-hit path fires the first flush inline when
    // buffer.length >= MAX_BATCH.
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

    // The tail (3 items) must be rescheduled — it should NOT sit until the
    // next enqueue or pagehide.
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(2);

    const firstBatch = JSON.parse(
      await (sendBeaconSpy.mock.calls[0][1] as Blob).text(),
    );
    const secondBatch = JSON.parse(
      await (sendBeaconSpy.mock.calls[1][1] as Blob).text(),
    );
    expect(firstBatch.metrics).toHaveLength(MAX_BATCH);
    expect(secondBatch.metrics).toHaveLength(total - MAX_BATCH);
    // Values preserve FIFO order.
    expect(firstBatch.metrics[0].value).toBe(1);
    expect(secondBatch.metrics[0].value).toBe(MAX_BATCH + 1);
  });

  it("uses sendBeacon when available and does not touch fetch", async () => {
    enqueue(makeMetric("LCP", 100));
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to keepalive fetch when sendBeacon reports failure", async () => {
    sendBeaconSpy.mockReturnValueOnce(false);
    enqueue(makeMetric("LCP", 100));
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    expect(init).toMatchObject({
      method: "POST",
      keepalive: true,
      credentials: "omit",
    });
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/json",
    });
  });

  it("falls back to fetch when navigator.sendBeacon throws", async () => {
    sendBeaconSpy.mockImplementationOnce(() => {
      throw new Error("beacon blocked");
    });
    enqueue(makeMetric("LCP", 100));
    await waitMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("drops metrics with non-numeric, NaN, or negative values", async () => {
    enqueue({ name: "LCP", value: Number.NaN, rating: "good" });
    enqueue({ name: "LCP", value: -5, rating: "good" });
    enqueue({ name: "LCP", value: "100" as unknown as number, rating: "good" });
    enqueue(null as unknown as { name: string; value: number });
    await waitMicrotasks();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drops metrics without a recognized rating to avoid server-side batch loss", async () => {
    // Server validates `WebVitalsPayloadSchema` де `rating` обов'язковий.
    // Якщо відправити запис без рейтингу, ВЕСЬ батч буде відкинутий і
    // решта валідних метрик мовчки втратиться. Тому drop саме на клієнті,
    // ще до буфера.
    enqueue({ name: "LCP", value: 100 } as { name: string; value: number });
    enqueue({ name: "LCP", value: 100, rating: "" });
    enqueue({ name: "LCP", value: 100, rating: "unknown" });
    await waitMicrotasks();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();

    // Натомість запис із рейтингом потрапляє в батч одного хоста.
    enqueue({ name: "LCP", value: 100, rating: "good" });
    enqueue({ name: "INP", value: 100, rating: "needs-improvement" });
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      await (sendBeaconSpy.mock.calls[0][1] as Blob).text(),
    );
    expect(payload.metrics).toHaveLength(2);
    expect(payload.metrics[0]).toMatchObject({ name: "LCP", rating: "good" });
    expect(payload.metrics[1]).toMatchObject({
      name: "INP",
      rating: "needs-improvement",
    });
  });

  it("rounds non-CLS metrics to integers and keeps CLS precision", async () => {
    enqueue(makeMetric("LCP", 123.6));
    enqueue(makeMetric("CLS", 0.123456));
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      await (sendBeaconSpy.mock.calls[0][1] as Blob).text(),
    );
    expect(payload.metrics[0]).toMatchObject({ name: "LCP", value: 124 });
    expect(payload.metrics[1]).toMatchObject({ name: "CLS", value: 0.1235 });
  });
});

describe("initWebVitals under Capacitor", () => {
  afterEach(() => {
    vi.doUnmock("@sergeant/shared");
    vi.doUnmock("web-vitals");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("skips init: does not load web-vitals nor wire lifecycle", async () => {
    vi.resetModules();

    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => true };
    });

    const onLCP = vi.fn();
    const onINP = vi.fn();
    const onCLS = vi.fn();
    const onFCP = vi.fn();
    const onTTFB = vi.fn();
    vi.doMock("web-vitals", () => ({ onLCP, onINP, onCLS, onFCP, onTTFB }));

    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    // None of the `web-vitals` collectors must be registered.
    expect(onLCP).not.toHaveBeenCalled();
    expect(onINP).not.toHaveBeenCalled();
    expect(onCLS).not.toHaveBeenCalled();
    expect(onFCP).not.toHaveBeenCalled();
    expect(onTTFB).not.toHaveBeenCalled();

    // No lifecycle listeners should be wired either.
    expect(docAdd).not.toHaveBeenCalledWith(
      "visibilitychange",
      expect.anything(),
      expect.anything(),
    );
    expect(winAdd).not.toHaveBeenCalledWith(
      "pagehide",
      expect.anything(),
      expect.anything(),
    );
  });
});
