// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEEP_LINK_PROTOCOL_VERSION,
  SHELL_DEEPLINK_CHANNEL,
  createDeepLinkChannel,
  isDeepLinkMessage,
} from "./deepLinkChannel.js";

/**
 * Тести deep-link каналу. Покриваємо:
 *   1. `isDeepLinkMessage()` — type-guard для будь-якого payload-у з каналу.
 *   2. Round-trip: один `createDeepLinkChannel()` шле, інший — отримує.
 *   3. Protocol-version: receiver ігнорує повідомлення з невідомою версією.
 *   4. Null-channel fallback коли BroadcastChannel недоступний у globalThis.
 *   5. unsubscribe() — handler не викликається після відписки.
 *   6. Помилка в одному handler-і не вбиває delivery решті.
 */

describe("isDeepLinkMessage", () => {
  it("accepts valid message shape", () => {
    expect(
      isDeepLinkMessage({
        protocolVersion: DEEP_LINK_PROTOCOL_VERSION,
        url: "/finyk",
        source: "shell",
        timestamp: 123,
      }),
    ).toBe(true);
  });

  it("rejects mismatched protocol version", () => {
    expect(
      isDeepLinkMessage({
        protocolVersion: 999,
        url: "/finyk",
        source: "shell",
        timestamp: 123,
      }),
    ).toBe(false);
  });

  it("rejects missing/extra fields and wrong types", () => {
    expect(isDeepLinkMessage(null)).toBe(false);
    expect(isDeepLinkMessage("not an object")).toBe(false);
    expect(isDeepLinkMessage({})).toBe(false);
    expect(
      isDeepLinkMessage({
        protocolVersion: DEEP_LINK_PROTOCOL_VERSION,
        url: 42, // wrong type
        source: "shell",
        timestamp: 1,
      }),
    ).toBe(false);
    expect(
      isDeepLinkMessage({
        protocolVersion: DEEP_LINK_PROTOCOL_VERSION,
        url: "/x",
        source: "unknown", // not in union
        timestamp: 1,
      }),
    ).toBe(false);
  });
});

describe("createDeepLinkChannel — BroadcastChannel present", () => {
  beforeEach(() => {
    // jsdom (vitest workspace) has native BroadcastChannel since vitest 3+.
    // Verify availability before each test for safety.
    expect(typeof globalThis.BroadcastChannel).toBe("function");
  });

  it("delivers a message from sender to subscriber via BroadcastChannel", async () => {
    const sender = createDeepLinkChannel();
    const receiver = createDeepLinkChannel();
    const received: Array<{ url: string; source: string }> = [];
    const unsub = receiver.subscribe((msg) => {
      received.push({ url: msg.url, source: msg.source });
    });

    expect(sender.isOpen).toBe(true);
    expect(receiver.isOpen).toBe(true);

    const ok = sender.post({ url: "/finyk/transactions/42", source: "shell" });
    expect(ok).toBe(true);

    // BroadcastChannel dispatches asynchronously through the event loop;
    // give it one microtask + macrotask to flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(received).toEqual([
      { url: "/finyk/transactions/42", source: "shell" },
    ]);

    unsub();
    sender.close();
    receiver.close();
  });

  it("uses the canonical channel name `sergeant-shell-deeplink`", () => {
    expect(SHELL_DEEPLINK_CHANNEL).toBe("sergeant-shell-deeplink");
  });

  it("ignores messages with mismatched protocol version", async () => {
    const receiver = createDeepLinkChannel();
    const handler = vi.fn();
    const unsub = receiver.subscribe(handler);

    // Bypass `post()` to inject a bad-shape message directly into the
    // underlying channel. Mirrors a future shell shipped before web bumped
    // `DEEP_LINK_PROTOCOL_VERSION` — receiver must not crash, just drop.
    const directSender = new BroadcastChannel(SHELL_DEEPLINK_CHANNEL);
    directSender.postMessage({
      protocolVersion: 999,
      url: "/finyk",
      source: "shell",
      timestamp: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(handler).not.toHaveBeenCalled();

    unsub();
    directSender.close();
    receiver.close();
  });

  it("unsubscribe stops further deliveries", async () => {
    const sender = createDeepLinkChannel();
    const receiver = createDeepLinkChannel();
    const handler = vi.fn();
    const unsub = receiver.subscribe(handler);

    sender.post({ url: "/chat", source: "shell" });
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    sender.post({ url: "/profile", source: "shell" });
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalledTimes(1);

    sender.close();
    receiver.close();
  });

  it("a throwing handler does not stop delivery to other handlers", async () => {
    const sender = createDeepLinkChannel();
    const receiver = createDeepLinkChannel();
    const goodHandler = vi.fn();
    const badHandler = vi.fn(() => {
      throw new Error("subscriber boom");
    });
    receiver.subscribe(badHandler);
    receiver.subscribe(goodHandler);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    sender.post({ url: "/welcome", source: "shell" });
    await new Promise((r) => setTimeout(r, 0));

    expect(goodHandler).toHaveBeenCalledTimes(1);
    expect(badHandler).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    sender.close();
    receiver.close();
  });

  it("post() returns false and logs when channel.postMessage throws", () => {
    const sender = createDeepLinkChannel();
    expect(sender.isOpen).toBe(true);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Force the underlying postMessage to throw — simulate sandboxed
    // WebView that exposes BroadcastChannel constructor but blocks
    // cross-context postMessage.
    const channelInternals = sender as unknown as {
      post: (p: { url: string; source: "shell" | "web" }) => boolean;
    };
    const original = BroadcastChannel.prototype.postMessage;
    BroadcastChannel.prototype.postMessage = (): void => {
      throw new Error("blocked");
    };
    try {
      const ok = channelInternals.post({ url: "/x", source: "shell" });
      expect(ok).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      BroadcastChannel.prototype.postMessage = original;
      warnSpy.mockRestore();
      sender.close();
    }
  });
});

describe("createDeepLinkChannel — BroadcastChannel absent (legacy WebView)", () => {
  let originalBC: typeof BroadcastChannel | undefined;

  beforeEach(() => {
    originalBC = globalThis.BroadcastChannel;
    // Simulate iOS <15.4 WKWebView / very old Android WebView where the
    // API isn't exposed at all.
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;
  });

  afterEach(() => {
    if (originalBC) {
      (
        globalThis as { BroadcastChannel?: typeof BroadcastChannel }
      ).BroadcastChannel = originalBC;
    }
  });

  it("returns a null-channel where post() is false and subscribe is no-op", () => {
    const ch = createDeepLinkChannel();
    expect(ch.isOpen).toBe(false);
    const handler = vi.fn();
    const unsub = ch.subscribe(handler);
    expect(ch.post({ url: "/x", source: "shell" })).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    // unsubscribe and close are no-ops but must not throw
    unsub();
    ch.close();
  });
});
