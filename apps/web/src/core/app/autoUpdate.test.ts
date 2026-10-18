// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupAutoUpdate } from "./autoUpdate";
import {
  registerDirtyState,
  resetDirtyStateForTests,
} from "@shared/lib/ui/dirtyState";
import { setHubStreaming } from "../hub/streamingStore";
import { resetSwReloadForTests, isLocalUpdateRequested } from "./swReload";

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
    resetDirtyStateForTests();
    resetSwReloadForTests();
    setHubStreaming(false);
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

    // First sighting is only a baseline; the API redeploying under the
    // live tab (id changes) at t=0 starts the timer.
    ctrl.reportServerBuildId("0000000");
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

    ctrl.reportServerBuildId("0000000");
    ctrl.reportServerBuildId("def5678"); // redeploy mid-session → timer armed
    // Server rolls back / matches client → state must clear.
    ctrl.reportServerBuildId("abc1234");

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(events).toEqual([]);
    expect(window.__pwaUpdateReady).toBeUndefined();
    ctrl.dispose();
  });

  // Регресія: сервер ріже `X-Server-Build-Id` до 7 символів
  // (`apps/server/src/http/buildIdHeader.ts`), а клієнтський `VITE_BUILD_ID` —
  // це повний `VERCEL_GIT_COMMIT_SHA`. Поки обидві сторони не зводились до
  // короткої форми, рівність була недосяжна навіть для одного коміту, і
  // hard-floor піднімав плашку «нова версія» у кожній сесії через годину.
  it("treats a short server sha and the full client sha of one commit as a match", async () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    const ctrl = setupAutoUpdate({
      clientBuildId: "9f3c1ab7d2e45608b1aa77c3390ef4d5a6b8c012",
      buildIdMismatchPromptMs: 60 * 60 * 1000,
    });

    ctrl.reportServerBuildId("9f3c1ab");

    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    expect(events).toEqual([]);
    expect(window.__pwaUpdateReady).toBeUndefined();
    ctrl.dispose();
  });

  it("still force-prompts when the short shas genuinely differ", async () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    const ctrl = setupAutoUpdate({
      clientBuildId: "9f3c1ab7d2e45608b1aa77c3390ef4d5a6b8c012",
      buildIdMismatchPromptMs: 60 * 60 * 1000,
    });

    ctrl.reportServerBuildId("1111111");
    ctrl.reportServerBuildId("0d42e91");

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1);
    expect(events).toEqual(["ready"]);
    ctrl.dispose();
  });

  // Регресія (sec-19): Coolify почав віддавати `X-Server-Build-Id`
  // (SOURCE_COMMIT), а веб і API деплояться незалежно: коміт лише в
  // `apps/server` лишає веб на A, а API на B назавжди. Наївне «сервер ≠
  // клієнт» давало б плашку «нова версія» в кожній сесії довшій за годину
  // (перезавантаження не помагало б: бандл той самий).
  it("does NOT prompt when the server id differs from the client but never changes (API on B, web on A)", async () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    let fakeNow = 0;
    const ctrl = setupAutoUpdate({
      clientBuildId: "aaaaaaa1234567890aaaaaaa1234567890aaaaaa",
      buildIdMismatchPromptMs: 60 * 60 * 1000,
      now: () => fakeNow,
    });

    // Every API response in a long session carries the same B.
    for (let i = 0; i < 10; i++) {
      ctrl.reportServerBuildId("bbbbbbb");
      fakeNow += 30 * 60 * 1000;
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    }
    expect(events).toEqual([]);
    expect(window.__pwaUpdateReady).toBeUndefined();
    ctrl.dispose();
  });

  it("prompts only after the server id changes mid-session and stays different past the grace window", async () => {
    installServiceWorkerMock();
    const events: string[] = [];
    window.addEventListener("pwa-update-ready", () => events.push("ready"));
    const ctrl = setupAutoUpdate({
      clientBuildId: "aaaaaaa1234567890aaaaaaa1234567890aaaaaa",
      buildIdMismatchPromptMs: 60 * 60 * 1000,
    });

    ctrl.reportServerBuildId("bbbbbbb"); // baseline
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(events).toEqual([]);

    ctrl.reportServerBuildId("ccccccc"); // API redeployed under the tab
    await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(events).toEqual(["ready"]);
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
  // data-45: тихий idle-reload не має права знищувати незбережений ввід.
  describe("idle skip-waiting × незбережений ввід", () => {
    /** Ховає вкладку на 6 хв і повертає її; повертає `updateSW`-спай. */
    async function hideSixMinutesThenShow(
      extra: Partial<Parameters<typeof setupAutoUpdate>[0]> = {},
    ) {
      const waitingSW = { postMessage: vi.fn() } as unknown as ServiceWorker;
      installServiceWorkerMock({ waiting: waitingSW });
      const updateSW = vi.fn();
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      let fakeNow = 0;
      const ctrl = setupAutoUpdate({
        updateSW,
        idleSkipWaitingMs: 5 * 60 * 1000,
        now: () => fakeNow,
        ...extra,
      });
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      fakeNow = 6 * 60 * 1000;
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
      return { updateSW, ctrl };
    }

    it("НЕ викликає triggerUpdate, поки реєстр брудного стану непорожній", async () => {
      registerDirtyState(); // відкритий аркуш / непорожній композер
      const { updateSW, ctrl } = await hideSixMinutesThenShow();
      expect(updateSW).not.toHaveBeenCalled();
      expect(isLocalUpdateRequested()).toBe(false);
      ctrl.dispose();
    });

    it("викликає triggerUpdate як раніше, коли реєстр порожній", async () => {
      const { updateSW, ctrl } = await hideSixMinutesThenShow();
      expect(updateSW).toHaveBeenCalledWith(true);
      expect(isLocalUpdateRequested()).toBe(true);
      ctrl.dispose();
    });

    it("знову дозволяє оновлення, щойно аркуш закрито (зняття з реєстру)", async () => {
      const unregister = registerDirtyState();
      unregister();
      const { updateSW, ctrl } = await hideSixMinutesThenShow();
      expect(updateSW).toHaveBeenCalledWith(true);
      ctrl.dispose();
    });

    it("НЕ викликає triggerUpdate під час стріму HubChat", async () => {
      setHubStreaming(true);
      const { updateSW, ctrl } = await hideSixMinutesThenShow();
      expect(updateSW).not.toHaveBeenCalled();
      ctrl.dispose();
    });

    it("НЕ викликає triggerUpdate, коли є мутації в польоті", async () => {
      const { updateSW, ctrl } = await hideSixMinutesThenShow({
        isMutating: () => true,
      });
      expect(updateSW).not.toHaveBeenCalled();
      ctrl.dispose();
    });
  });
});
