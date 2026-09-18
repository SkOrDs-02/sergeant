// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHELL_DEEPLINK_BRIDGE_READY_KEY,
  SHELL_DEEPLINK_QUEUE_KEY,
} from "@sergeant/shared";

/**
 * Тести deep-link bridge: як `initNativeShell()` передає parsed-path у
 * web-шар через BroadcastChannel + pre-mount queue.
 */

type CapacitorMocks = {
  StatusBar: {
    setStyle: ReturnType<typeof vi.fn>;
    setBackgroundColor: ReturnType<typeof vi.fn>;
  };
  SplashScreen: { hide: ReturnType<typeof vi.fn> };
  Keyboard: { setResizeMode: ReturnType<typeof vi.fn> };
  App: {
    addListener: ReturnType<typeof vi.fn>;
    exitApp: ReturnType<typeof vi.fn>;
  };
};

type UrlOpenCallback = (event: { url: string }) => void;

type BridgeWindow = Window & {
  [SHELL_DEEPLINK_QUEUE_KEY]?: string[];
  [SHELL_DEEPLINK_BRIDGE_READY_KEY]?: boolean;
};

function installCapacitorMocks(): CapacitorMocks {
  const StatusBar = {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setBackgroundColor: vi.fn().mockResolvedValue(undefined),
  };
  const SplashScreen = { hide: vi.fn().mockResolvedValue(undefined) };
  const Keyboard = { setResizeMode: vi.fn().mockResolvedValue(undefined) };
  const App = {
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    exitApp: vi.fn().mockResolvedValue(undefined),
  };

  vi.doMock("@capacitor/status-bar", () => ({
    StatusBar,
    Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" },
  }));
  vi.doMock("@capacitor/splash-screen", () => ({ SplashScreen }));
  vi.doMock("@capacitor/keyboard", () => ({
    Keyboard,
    KeyboardResize: {
      Body: "body",
      Ionic: "ionic",
      Native: "native",
      None: "none",
    },
  }));
  vi.doMock("@capacitor/app", () => ({ App }));

  return { StatusBar, SplashScreen, Keyboard, App };
}

async function captureUrlOpenCallback(
  mocks: CapacitorMocks,
  options: { navigate?: (path: string) => void } = {},
): Promise<UrlOpenCallback> {
  const { initNativeShell } = await import("../index.js");
  await initNativeShell(options);

  const call = mocks.App.addListener.mock.calls.find(
    ([event]) => event === "appUrlOpen",
  );
  expect(call?.[0]).toBe("appUrlOpen");
  const cb = call?.[1] as UrlOpenCallback;
  expect(typeof cb).toBe("function");
  return cb;
}

function resetBridgeGlobals(): void {
  const w = window as BridgeWindow;
  delete w[SHELL_DEEPLINK_QUEUE_KEY];
  delete w[SHELL_DEEPLINK_BRIDGE_READY_KEY];
}

async function waitForBroadcast(
  predicate: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  vi.resetModules();
  resetBridgeGlobals();
});

afterEach(() => {
  vi.doUnmock("@capacitor/status-bar");
  vi.doUnmock("@capacitor/splash-screen");
  vi.doUnmock("@capacitor/keyboard");
  vi.doUnmock("@capacitor/app");
  vi.restoreAllMocks();
  resetBridgeGlobals();
});

describe("deep-link bridge — preference order", () => {
  it("`options.navigate` short-circuits BroadcastChannel and queue", async () => {
    const mocks = installCapacitorMocks();
    const optionsNav = vi.fn();
    const cb = await captureUrlOpenCallback(mocks, { navigate: optionsNav });
    cb({ url: "com.sergeant.shell://profile" });

    expect(optionsNav).toHaveBeenCalledTimes(1);
    expect(optionsNav).toHaveBeenCalledWith("/profile");
    expect((window as BridgeWindow)[SHELL_DEEPLINK_QUEUE_KEY]).toBeUndefined();
  });

  it("cold start — path потрапляє у queue коли bridge ще не ready", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://finyk" });

    expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toEqual(["/finyk"]);
  });

  it("bridge ready + BroadcastChannel — не пише у queue", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    w[SHELL_DEEPLINK_BRIDGE_READY_KEY] = true;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://nutrition/scan" });

    expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toBeUndefined();
  });

  it("множинні cold-start події акумулюються у черзі (FIFO)", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://finyk" });
    cb({ url: "com.sergeant.shell://fizruk" });
    cb({ url: "com.sergeant.shell://routine#today" });

    expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toEqual([
      "/finyk",
      "/fizruk",
      "/routine#today",
    ]);
  });

  it("shell не drain-ить queue — це робить web bridge", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://finyk" });
    cb({ url: "com.sergeant.shell://fizruk" });

    w[SHELL_DEEPLINK_BRIDGE_READY_KEY] = true;
    cb({ url: "com.sergeant.shell://routine" });

    expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toEqual(["/finyk", "/fizruk"]);
  });
});

describe("deep-link bridge — відкидання чужих URL", () => {
  it("чужа схема (https://…) НЕ попадає ні в navigate, ні в чергу", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    const optionsNav = vi.fn();

    const cb = await captureUrlOpenCallback(mocks, { navigate: optionsNav });
    cb({ url: "https://sergeant.app/home" });
    cb({ url: "javascript:alert(1)" });

    expect(optionsNav).not.toHaveBeenCalled();
    expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toBeUndefined();
  });
});

describe("deep-link bridge — resilience", () => {
  it("якщо `options.navigate` кидає — shell ловить, warn-ає, і не падає", async () => {
    const mocks = installCapacitorMocks();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const navigate = vi.fn(() => {
      throw new Error("boom");
    });

    const cb = await captureUrlOpenCallback(mocks, { navigate });
    expect(() => cb({ url: "com.sergeant.shell://welcome" })).not.toThrow();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = String(warnSpy.mock.calls[0]?.[0]);
    expect(warnArg).toContain("options.navigate");
  });

  it("існуюча (preserved) черга не перезаписується — pushes акумулюються", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    w[SHELL_DEEPLINK_QUEUE_KEY] = ["/welcome"];

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://profile" });

    expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toEqual(["/welcome", "/profile"]);
  });
});

describe("deep-link bridge — BroadcastChannel (PR-29)", () => {
  it("publishes parsed path on `sergeant-shell-deeplink` channel", async () => {
    const mocks = installCapacitorMocks();
    const bcReceiver = new BroadcastChannel("sergeant-shell-deeplink");
    const received: Array<{
      url: unknown;
      source: unknown;
      protocolVersion: unknown;
    }> = [];
    bcReceiver.onmessage = (ev: MessageEvent): void => {
      received.push({
        url: (ev.data as Record<string, unknown>)["url"],
        source: (ev.data as Record<string, unknown>)["source"],
        protocolVersion: (ev.data as Record<string, unknown>)[
          "protocolVersion"
        ],
      });
    };

    const cb = await captureUrlOpenCallback(mocks);
    try {
      cb({ url: "com.sergeant.shell://finyk/transactions/42" });

      await waitForBroadcast(() => received.length > 0);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({
        url: "/finyk/transactions/42",
        source: "shell",
        protocolVersion: 1,
      });
    } finally {
      bcReceiver.close();
    }
  });

  it("does NOT post to BroadcastChannel when `options.navigate` is provided", async () => {
    const mocks = installCapacitorMocks();
    const bcReceiver = new BroadcastChannel("sergeant-shell-deeplink");
    const received: unknown[] = [];
    bcReceiver.onmessage = (ev: MessageEvent): void => {
      received.push(ev.data);
    };
    const optionsNav = vi.fn();

    const cb = await captureUrlOpenCallback(mocks, { navigate: optionsNav });
    try {
      cb({ url: "com.sergeant.shell://profile" });

      await new Promise((r) => setTimeout(r, 0));

      expect(optionsNav).toHaveBeenCalledWith("/profile");
      expect(received).toHaveLength(0);
    } finally {
      bcReceiver.close();
    }
  });

  it("BC-less WebView — queue fallback замість BroadcastChannel", async () => {
    const mocks = installCapacitorMocks();
    const originalBC = globalThis.BroadcastChannel;
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;

    try {
      const w = window as BridgeWindow;
      const cb = await captureUrlOpenCallback(mocks);
      cb({ url: "com.sergeant.shell://welcome" });

      expect(w[SHELL_DEEPLINK_QUEUE_KEY]).toEqual(["/welcome"]);
    } finally {
      (
        globalThis as { BroadcastChannel?: typeof BroadcastChannel }
      ).BroadcastChannel = originalBC;
    }
  });
});
