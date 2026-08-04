// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { swClearCaches, swGetDebugSnapshot } from "./swControl";

function installServiceWorkerMock() {
  const et = new EventTarget();
  const controller = { postMessage: vi.fn() };
  const active = { postMessage: vi.fn() };
  const ready = Promise.resolve({ active });

  const sw = {
    controller,
    ready,
    addEventListener: et.addEventListener.bind(et),
    removeEventListener: et.removeEventListener.bind(et),
    dispatchEvent: et.dispatchEvent.bind(et),
  };

  Object.defineProperty(globalThis.navigator, "serviceWorker", {
    value: sw,
    configurable: true,
  });

  return { sw, controller, active };
}

describe("swControl", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
    });
  });

  it("swGetDebugSnapshot posts request and resolves on matching response", async () => {
    const { sw, controller } = installServiceWorkerMock();

    const p = swGetDebugSnapshot();
    // Чекаємо на факт відправки, а не на фіксовану кількість мікротасків:
    // `serviceWorker.ready` тепер проходить через `swReady()` (стеля на
    // необмежений await), і будь-яка зміна довжини цього ланцюга ламала б
    // tick-лічильник.
    await vi.waitFor(() =>
      expect(controller.postMessage).toHaveBeenCalledTimes(1),
    );
    const msg = controller.postMessage.mock.calls[0]![0];
    expect(msg.type).toBe("SW_DEBUG");
    expect(msg.data?.requestId).toMatch(/^sw_debug_/);

    const snapshot = { ok: true, version: "t", caches: { names: [] } };
    sw.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "SW_DEBUG_RESULT",
          requestId: msg.data.requestId,
          snapshot,
        },
      }),
    );

    await expect(p).resolves.toEqual(snapshot);
  });

  it("swClearCaches posts request and resolves on matching response", async () => {
    const { sw, controller } = installServiceWorkerMock();

    const p = swClearCaches();
    await vi.waitFor(() =>
      expect(controller.postMessage).toHaveBeenCalledTimes(1),
    );
    const msg = controller.postMessage.mock.calls[0]![0];
    expect(msg.type).toBe("CLEAR_SW_CACHES");
    expect(msg.data?.requestId).toMatch(/^sw_clear_/);

    const result = { ok: true, deleted: ["api-cache-vx"] };
    sw.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "CLEAR_SW_CACHES_RESULT",
          requestId: msg.data.requestId,
          result,
        },
      }),
    );

    await expect(p).resolves.toEqual(result);
  });

  it("swClearCaches rejects instead of hanging when serviceWorker.ready never settles", async () => {
    // Аудит 2026-08-04, знахідка 4: `navigator.serviceWorker.ready` не
    // резолвиться, поки для скоупу немає активного SW (dev-сервер, private
    // mode, провалена реєстрація) — і не реджектиться ніколи. Без стелі
    // `logout()` зависав на цьому await після вбитої серверної сесії, і UI
    // лишався залогіненим.
    vi.useFakeTimers();
    try {
      Object.defineProperty(globalThis.navigator, "serviceWorker", {
        value: {
          controller: { postMessage: vi.fn() },
          ready: new Promise(() => {}), // навмисно ніколи не settles
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        configurable: true,
      });

      const p = swClearCaches();
      const assertion = expect(p).rejects.toThrow(/timeout/i);
      await vi.advanceTimersByTimeAsync(2100);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
