// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupAutoUpdate } from "./autoUpdate";

interface FakeRegistration {
  update: ReturnType<typeof vi.fn>;
  waiting: ServiceWorker | null;
}

function installServiceWorkerMock(initial?: {
  waiting?: ServiceWorker | null;
}) {
  const reg: FakeRegistration = {
    update: vi.fn().mockResolvedValue(undefined),
    waiting: initial?.waiting ?? null,
  };
  const sw = {
    controller: null,
    ready: Promise.resolve(reg),
    getRegistration: vi.fn().mockResolvedValue(reg),
  };
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    value: sw,
    configurable: true,
  });
  return { reg, sw };
}

function uninstallServiceWorkerMock() {
  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    value: undefined,
    configurable: true,
  });
}

describe("setupAutoUpdate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    uninstallServiceWorkerMock();
    delete (window as { __pwaUpdateReady?: boolean }).__pwaUpdateReady;
    delete (window as { __pwaUpdateSW?: unknown }).__pwaUpdateSW;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no-op when navigator.serviceWorker is undefined", () => {
    const updateSW = vi.fn();
    const ctrl = setupAutoUpdate({ updateSW });
    ctrl.reportServerBuildId("anything");
    vi.advanceTimersByTime(60_000_000);
    expect(updateSW).not.toHaveBeenCalled();
    ctrl.dispose();
  });

  it("calls registration.update() on the configured interval", async () => {
    const { reg } = installServiceWorkerMock();
    const ctrl = setupAutoUpdate({
      updateIntervalMs: 30 * 60 * 1000,
      idleSkipWaitingMs: 5 * 60 * 1000,
    });
    // Cold-start kick + interval ticks.
    await Promise.resolve();
    await Promise.resolve();
    expect(reg.update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(reg.update).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(reg.update).toHaveBeenCalledTimes(3);

    ctrl.dispose();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(reg.update).toHaveBeenCalledTimes(3);
  });

  it("respects navigator.connection.saveData by skipping periodic ticks", async () => {
    const { reg } = installServiceWorkerMock();
    Object.defineProperty(globalThis.navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
    const ctrl = setupAutoUpdate({ updateIntervalMs: 30 * 60 * 1000 });
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(reg.update).not.toHaveBeenCalled();
    ctrl.dispose();
    Object.defineProperty(globalThis.navigator, "connection", {
      value: undefined,
      configurable: true,
    });
  });

  it("auto skip-waiting when tab visible after >5min hidden with waiting SW", async () => {
    const waitingSW = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const { reg } = installServiceWorkerMock({ waiting: waitingSW });
    const updateSW = vi.fn();

    // Force visibilityState to "visible" before setup.
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    let fakeNow = 0;
    const ctrl = setupAutoUpdate({
      updateSW,
      idleSkipWaitingMs: 5 * 60 * 1000,
      now: () => fakeNow,
    });

    // Hide the tab at t=0.
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    // Bring it back after 4 min — below threshold, no skipWaiting.
    fakeNow = 4 * 60 * 1000;
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();
    expect(updateSW).not.toHaveBeenCalled();

    // Hide again, wait 6 min — past threshold, must skipWaiting.
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    fakeNow = 4 * 60 * 1000 + 6 * 60 * 1000;
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateSW).toHaveBeenCalledWith(true);
    void reg;
    ctrl.dispose();
  });

  it("does NOT skip-waiting when no waiting SW exists", async () => {
    installServiceWorkerMock({ waiting: null });
    const updateSW = vi.fn();
    let fakeNow = 0;
    const ctrl = setupAutoUpdate({
      updateSW,
      idleSkipWaitingMs: 60_000,
      now: () => fakeNow,
    });

    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();

    fakeNow = 5 * 60 * 1000;
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();

    expect(updateSW).not.toHaveBeenCalled();
    ctrl.dispose();
  });

  it("force-prompts after build-id mismatch persists past threshold", async () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    const fakeNow = 0;
    const ctrl = setupAutoUpdate({
      clientBuildId: "abc1234",
      buildIdMismatchPromptMs: 60 * 60 * 1000,
      now: () => fakeNow,
    });

    // First sighting at t=0 starts the timer.
    ctrl.reportServerBuildId("def5678");
    expect(events).toEqual([]);

    // Still inside grace window.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(events).toEqual([]);

    // Cross the threshold → timer fires → pwa-update-ready dispatched.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1);
    expect(events).toEqual(["ready"]);
    expect(window.__pwaUpdateReady).toBe(true);

    // Re-reporting the same mismatched id must not re-fire.
    ctrl.reportServerBuildId("def5678");
    expect(events).toEqual(["ready"]);

    ctrl.dispose();
  });

  it("clears mismatch state when server catches up to client build-id", async () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    const ctrl = setupAutoUpdate({
      clientBuildId: "abc1234",
      buildIdMismatchPromptMs: 60 * 60 * 1000,
    });

    ctrl.reportServerBuildId("def5678");
    // Server rolls back / matches client → state must clear.
    ctrl.reportServerBuildId("abc1234");

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(events).toEqual([]);
    expect(window.__pwaUpdateReady).toBeUndefined();
    ctrl.dispose();
  });

  it("ignores empty / whitespace-only / nullish server build-id values", () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    const ctrl = setupAutoUpdate({ clientBuildId: "abc1234" });

    ctrl.reportServerBuildId(undefined);
    ctrl.reportServerBuildId(null);
    ctrl.reportServerBuildId("");
    ctrl.reportServerBuildId("   ");
    vi.advanceTimersByTime(10 * 60 * 60 * 1000);
    expect(events).toEqual([]);
    ctrl.dispose();
  });
});
