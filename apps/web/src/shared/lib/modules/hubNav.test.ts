// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  openHubModule,
  openHubModuleWithAction,
  HUB_OPEN_MODULE_EVENT,
} from "./hubNav";

describe("openHubModule", () => {
  let listener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listener = vi.fn();
    window.addEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });

  it("диспатчить CustomEvent з module та hash", () => {
    openHubModule("finyk", "/analytics");
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail).toEqual({ module: "finyk", hash: "/analytics" });
  });

  it("не диспатчить для невалідного moduleId", () => {
    // @ts-expect-error тестуємо runtime guard
    openHubModule("invalid");
    expect(listener).not.toHaveBeenCalled();
  });

  it("hash за замовчуванням — порожній рядок", () => {
    openHubModule("fizruk");
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.hash).toBe("");
  });
});

describe("openHubModuleWithAction", () => {
  let listener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listener = vi.fn();
    window.addEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });
  afterEach(() => {
    window.removeEventListener(HUB_OPEN_MODULE_EVENT, listener);
  });

  it("диспатчить з action", () => {
    openHubModuleWithAction("finyk", "add_expense");
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.action).toBe("add_expense");
    expect(detail.module).toBe("finyk");
  });

  it("не диспатчить для невалідної дії", () => {
    // @ts-expect-error тестуємо runtime guard
    openHubModuleWithAction("finyk", "invalid_action");
    expect(listener).not.toHaveBeenCalled();
  });
});
