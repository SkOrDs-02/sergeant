import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetHubBusForTests, emitHubBus, onHubBus } from "./hubBus";

afterEach(() => {
  __resetHubBusForTests();
});

describe("hubBus", () => {
  it("delivers typed openChat detail to subscribers", () => {
    const handler = vi.fn();
    onHubBus("openChat", handler);
    emitHubBus("openChat", { message: "hi", autoSend: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ message: "hi", autoSend: true });
  });

  it("delivers void openSearch event to subscribers", () => {
    const handler = vi.fn();
    onHubBus("openSearch", handler);
    emitHubBus("openSearch", undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports multiple subscribers per event in registration order", () => {
    const order: number[] = [];
    onHubBus("openSearch", () => order.push(1));
    onHubBus("openSearch", () => order.push(2));
    onHubBus("openSearch", () => order.push(3));
    emitHubBus("openSearch", undefined);
    expect(order).toEqual([1, 2, 3]);
  });

  it("unsubscribe stops further deliveries", () => {
    const handler = vi.fn();
    const off = onHubBus("openChat", handler);
    emitHubBus("openChat", { message: null });
    off();
    emitHubBus("openChat", { message: "post-unsub" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not crosstalk between different events", () => {
    const chatHandler = vi.fn();
    const searchHandler = vi.fn();
    onHubBus("openChat", chatHandler);
    onHubBus("openSearch", searchHandler);
    emitHubBus("openChat", { message: "x" });
    expect(chatHandler).toHaveBeenCalledTimes(1);
    expect(searchHandler).not.toHaveBeenCalled();
  });

  it("a throwing handler does not break other handlers", () => {
    vi.useFakeTimers();
    const good = vi.fn();
    onHubBus("openSearch", () => {
      throw new Error("boom");
    });
    onHubBus("openSearch", good);
    expect(() => emitHubBus("openSearch", undefined)).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    // The error is re-thrown asynchronously via setTimeout(0) so the
    // publishing site stays clean. Drop the queued throw before the
    // test environment surfaces it.
    expect(() => vi.runAllTimers()).toThrow("boom");
    vi.useRealTimers();
  });
});
