// @vitest-environment jsdom
/**
 * @status Active
 * Additional coverage for webVitals.ts — the main test covers enqueue/flush
 * mechanics and the Capacitor early-exit. This file adds:
 *
 * - `initWebVitals` happy path (non-Capacitor, wires all five observers)
 * - `initWebVitals` double-init guard (`initialized` flag)
 * - `initWebVitals` import-error resilience
 * - `wireLifecycle` event-listener wiring
 * - `pagehide` event triggering a synchronous flush
 * - `visibilitychange:hidden` event triggering a flush
 * - `flush` no-op when buffer is already empty
 * - `flush` when `navigator.sendBeacon` is not a function (falls back to fetch)
 * - `enqueue` dropping unsupported metric names
 */
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/lib/api/apiUrl", () => ({
  apiUrl: (p: string) => `https://api.test${p}`,
}));

async function waitMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

// ─── flush edge-cases (no module reset needed) ──────────────────────────────

describe("webVitals.flush — edge cases", () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("./webVitals");
    mod.__resetForTests();
    sendBeaconSpy = vi.fn(() => true);
    fetchSpy = vi.fn(() => Promise.resolve(new Response()));
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: fetchSpy,
    });
  });

  afterEach(async () => {
    const mod = await import("./webVitals");
    mod.__resetForTests();
    vi.restoreAllMocks();
  });

  it("flush is a no-op when buffer is empty — neither sendBeacon nor fetch is called", async () => {
    // After reset there are no buffered metrics; waiting out the microtask
    // queue should produce zero network calls.
    await waitMicrotasks();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to fetch when sendBeacon is not a function", async () => {
    // Guard: `typeof navigator.sendBeacon === 'function'` — if the browser
    // exposes `sendBeacon` as something truthy but not a function (edge case)
    // the catch path kicks in and we fall through to keepalive fetch.
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: undefined, // not a function
    });

    const { enqueue } = await import("./webVitals");
    enqueue({ name: "LCP", value: 100, rating: "good" });
    await waitMicrotasks();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).keepalive).toBe(true);
  });

  it("drops metrics with unsupported names (e.g. the retired FID metric)", async () => {
    const { enqueue } = await import("./webVitals");
    enqueue({ name: "FID", value: 50, rating: "good" });
    await waitMicrotasks();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

// ─── initWebVitals paths (each test resets modules to get fresh state) ───────

describe("initWebVitals — non-Capacitor paths", () => {
  afterEach(() => {
    vi.doUnmock("@sergeant/shared");
    vi.doUnmock("web-vitals");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("registers all five web-vitals observers on the first call", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });

    const onLCP = vi.fn();
    const onINP = vi.fn();
    const onCLS = vi.fn();
    const onFCP = vi.fn();
    const onTTFB = vi.fn();
    vi.doMock("web-vitals", () => ({ onLCP, onINP, onCLS, onFCP, onTTFB }));

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    expect(onLCP).toHaveBeenCalledTimes(1);
    expect(onINP).toHaveBeenCalledTimes(1);
    expect(onCLS).toHaveBeenCalledTimes(1);
    expect(onFCP).toHaveBeenCalledTimes(1);
    expect(onTTFB).toHaveBeenCalledTimes(1);
  });

  it("skips double-init: web-vitals observers are NOT re-registered on the second call", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });

    const onLCP = vi.fn();
    const onINP = vi.fn();
    const onCLS = vi.fn();
    const onFCP = vi.fn();
    const onTTFB = vi.fn();
    vi.doMock("web-vitals", () => ({ onLCP, onINP, onCLS, onFCP, onTTFB }));

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();
    await mod.initWebVitals(); // second call — must be a no-op

    expect(onLCP).toHaveBeenCalledTimes(1);
    expect(onINP).toHaveBeenCalledTimes(1);
  });

  it("wires visibilitychange and pagehide lifecycle listeners on first call", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });
    vi.doMock("web-vitals", () => ({
      onLCP: vi.fn(),
      onINP: vi.fn(),
      onCLS: vi.fn(),
      onFCP: vi.fn(),
      onTTFB: vi.fn(),
    }));

    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    expect(docAdd).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
      { capture: true },
    );
    expect(winAdd).toHaveBeenCalledWith("pagehide", expect.any(Function), {
      capture: true,
    });
  });

  it("does NOT re-wire lifecycle listeners on a second initWebVitals call", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });
    vi.doMock("web-vitals", () => ({
      onLCP: vi.fn(),
      onINP: vi.fn(),
      onCLS: vi.fn(),
      onFCP: vi.fn(),
      onTTFB: vi.fn(),
    }));

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");

    await mod.initWebVitals(); // second call — initialized=true, returns early

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

  it("catches a web-vitals import error and returns without throwing", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });
    vi.doMock("web-vitals", () => {
      throw new Error("module load failed");
    });

    const mod = await import("./webVitals");
    mod.__resetForTests();
    // Must not throw — web-vitals chunk unavailable is a graceful no-op.
    await expect(mod.initWebVitals()).resolves.toBeUndefined();
  });
});

// ─── lifecycle event → flush integration ─────────────────────────────────────

describe("webVitals — lifecycle events trigger flush", () => {
  afterEach(() => {
    vi.doUnmock("@sergeant/shared");
    vi.doUnmock("web-vitals");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("pagehide fires a synchronous flush of buffered metrics", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });
    vi.doMock("web-vitals", () => ({
      onLCP: vi.fn(),
      onINP: vi.fn(),
      onCLS: vi.fn(),
      onFCP: vi.fn(),
      onTTFB: vi.fn(),
    }));

    const sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    // Enqueue a metric — scheduleFlush schedules via Promise.resolve
    // but has not yet run (synchronous code continues first).
    mod.enqueue({ name: "LCP", value: 200, rating: "good" });

    // pagehide fires synchronously — flush() runs inline, drains the buffer.
    window.dispatchEvent(new Event("pagehide"));
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);

    // After draining, the deferred microtask flush is a no-op.
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
  });

  it("visibilitychange:hidden fires a synchronous flush", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });
    vi.doMock("web-vitals", () => ({
      onLCP: vi.fn(),
      onINP: vi.fn(),
      onCLS: vi.fn(),
      onFCP: vi.fn(),
      onTTFB: vi.fn(),
    }));

    const sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    mod.enqueue({ name: "FCP", value: 500, rating: "good" });

    // jsdom does not set `document.visibilityState` automatically; stub it.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
  });

  it("visibilitychange:visible does NOT flush (only hidden state triggers send)", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });
    vi.doMock("web-vitals", () => ({
      onLCP: vi.fn(),
      onINP: vi.fn(),
      onCLS: vi.fn(),
      onFCP: vi.fn(),
      onTTFB: vi.fn(),
    }));

    const sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });

    const mod = await import("./webVitals");
    mod.__resetForTests();
    await mod.initWebVitals();

    mod.enqueue({ name: "TTFB", value: 100, rating: "good" });

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // Not flushed synchronously by visibilitychange:visible
    expect(sendBeaconSpy).not.toHaveBeenCalled();

    // But the microtask flush fires and sends it
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── enqueue — all three supported ratings pass through ──────────────────────

describe("webVitals.enqueue — all supported ratings accepted", () => {
  let sendBeaconSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const mod = await import("./webVitals");
    mod.__resetForTests();
    sendBeaconSpy = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      writable: true,
      value: vi.fn(() => Promise.resolve(new Response())),
    });
  });

  afterEach(async () => {
    const mod = await import("./webVitals");
    mod.__resetForTests();
    vi.restoreAllMocks();
  });

  it("'good' rating is accepted and flushed", async () => {
    const { enqueue } = await import("./webVitals");
    enqueue({ name: "INP", value: 50, rating: "good" });
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      await (sendBeaconSpy.mock.calls[0]![1] as Blob).text(),
    );
    expect(payload.metrics[0]).toMatchObject({ name: "INP", rating: "good" });
  });

  it("'needs-improvement' rating is accepted and flushed", async () => {
    const { enqueue } = await import("./webVitals");
    enqueue({ name: "LCP", value: 2500, rating: "needs-improvement" });
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      await (sendBeaconSpy.mock.calls[0]![1] as Blob).text(),
    );
    expect(payload.metrics[0]).toMatchObject({
      name: "LCP",
      rating: "needs-improvement",
      value: 2500,
    });
  });

  it("'poor' rating is accepted and flushed", async () => {
    const { enqueue } = await import("./webVitals");
    enqueue({ name: "CLS", value: 0.25, rating: "poor" });
    await waitMicrotasks();
    expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(
      await (sendBeaconSpy.mock.calls[0]![1] as Blob).text(),
    );
    expect(payload.metrics[0]).toMatchObject({ name: "CLS", rating: "poor" });
  });
});

// ─── initWebVitals — VITE_WEB_VITALS_ENDPOINT=0 guard ───────────────────────

describe("initWebVitals — VITE_WEB_VITALS_ENDPOINT=0 env guard", () => {
  afterEach(() => {
    vi.doUnmock("@sergeant/shared");
    vi.doUnmock("web-vitals");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns early without wiring when the endpoint env var is disabled", async () => {
    vi.resetModules();
    vi.doMock("@sergeant/shared", async () => {
      const actual =
        await vi.importActual<typeof import("@sergeant/shared")>(
          "@sergeant/shared",
        );
      return { ...actual, isCapacitor: () => false };
    });

    const onLCP = vi.fn();
    vi.doMock("web-vitals", () => ({
      onLCP,
      onINP: vi.fn(),
      onCLS: vi.fn(),
      onFCP: vi.fn(),
      onTTFB: vi.fn(),
    }));

    const mod = await import("./webVitals");
    mod.__resetForTests();

    // Temporarily override import.meta.env["VITE_WEB_VITALS_ENDPOINT"].
    // In Vitest+jsdom, import.meta.env is writable via vi.stubEnv.
    vi.stubEnv("VITE_WEB_VITALS_ENDPOINT", "0");

    await mod.initWebVitals();

    // Because VITE_WEB_VITALS_ENDPOINT === "0", init exits before wiring.
    // onLCP should not be called.
    expect(onLCP).not.toHaveBeenCalled();

    vi.unstubAllEnvs();
  });
});
