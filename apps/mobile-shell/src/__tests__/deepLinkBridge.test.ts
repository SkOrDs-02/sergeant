// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Тести deep-link bridge: як `initNativeShell()` передає parsed-path у
 * web-шар. Три сценарії preference-у:
 *   1. `options.navigate` (явний callback) — має бути single source of
 *      truth, shell не ліз у `window.*` bridge.
 *   2. `window.__sergeantShellNavigate` (React-встановлений bridge) —
 *      викликається, якщо options.navigate відсутній.
 *   3. Буферизація в `window.__sergeantShellDeepLinkQueue` — cold start,
 *      коли ні callback, ні bridge ще не встановлені.
 *
 * Покриваємо також resilience: якщо bridge-виклик кидає, shell лише
 * warn-ає у console — listener `appUrlOpen` повинен лишитись живим.
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
  __sergeantShellNavigate?: (path: string) => void;
  __sergeantShellDeepLinkQueue?: string[];
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
  delete w.__sergeantShellNavigate;
  delete w.__sergeantShellDeepLinkQueue;
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
  it("`options.navigate` має пріоритет над `window.__sergeantShellNavigate`", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    const bridgeNav = vi.fn();
    w.__sergeantShellNavigate = bridgeNav;

    const optionsNav = vi.fn();
    const cb = await captureUrlOpenCallback(mocks, { navigate: optionsNav });
    cb({ url: "com.sergeant.shell://profile" });

    expect(optionsNav).toHaveBeenCalledTimes(1);
    expect(optionsNav).toHaveBeenCalledWith("/profile");
    expect(bridgeNav).not.toHaveBeenCalled();
  });

  it("`window.__sergeantShellNavigate` викликається, якщо `options.navigate` відсутній", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    const bridgeNav = vi.fn();
    w.__sergeantShellNavigate = bridgeNav;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://nutrition/scan" });

    expect(bridgeNav).toHaveBeenCalledTimes(1);
    expect(bridgeNav).toHaveBeenCalledWith("/nutrition/scan");
    // Черга не використовується, коли bridge уже встановлений.
    expect(w.__sergeantShellDeepLinkQueue).toBeUndefined();
  });

  it("без bridge — path потрапляє у `__sergeantShellDeepLinkQueue`", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://finyk" });

    expect(w.__sergeantShellDeepLinkQueue).toEqual(["/finyk"]);
  });

  it("множинні cold-start події акумулюються у черзі (FIFO)", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://finyk" });
    cb({ url: "com.sergeant.shell://fizruk" });
    cb({ url: "com.sergeant.shell://routine#today" });

    expect(w.__sergeantShellDeepLinkQueue).toEqual([
      "/finyk",
      "/fizruk",
      "/routine#today",
    ]);
  });

  it("коли bridge встановлюється ПІСЛЯ кількох подій, черга не очищається shell-ем (це робить web)", async () => {
    // Shell — чесний producer: він тільки пише у чергу. Консьюмер
    // (web ShellDeepLinkBridge) — єдиний, хто її drain-ить. Так ми
    // не гонимося з React-render-ом і не програємо події двічі.
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://finyk" });
    cb({ url: "com.sergeant.shell://fizruk" });

    // Тепер web «встановлюється».
    const bridgeNav = vi.fn();
    w.__sergeantShellNavigate = bridgeNav;

    // Чергу shell НЕ чистить — це контракт.
    expect(w.__sergeantShellDeepLinkQueue).toEqual(["/finyk", "/fizruk"]);

    // Нова подія ПІСЛЯ install-у — йде напряму у bridge, минаючи чергу.
    cb({ url: "com.sergeant.shell://routine" });
    expect(bridgeNav).toHaveBeenCalledWith("/routine");
    expect(w.__sergeantShellDeepLinkQueue).toEqual(["/finyk", "/fizruk"]);
  });
});

describe("deep-link bridge — відкидання чужих URL", () => {
  it("чужа схема (https://…) НЕ попадає ні в navigate, ні в чергу", async () => {
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    const bridgeNav = vi.fn();
    w.__sergeantShellNavigate = bridgeNav;

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "https://sergeant.app/home" });
    cb({ url: "javascript:alert(1)" });

    expect(bridgeNav).not.toHaveBeenCalled();
    expect(w.__sergeantShellDeepLinkQueue).toBeUndefined();
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

  it("якщо `window.__sergeantShellNavigate` кидає — shell warn-ає і НЕ фоллбеч-ить у чергу (подія вже «доставлена»)", async () => {
    const mocks = installCapacitorMocks();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const w = window as BridgeWindow;
    w.__sergeantShellNavigate = vi.fn(() => {
      throw new Error("router-err");
    });

    const cb = await captureUrlOpenCallback(mocks);
    expect(() => cb({ url: "com.sergeant.shell://profile" })).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    const warnArg = String(warnSpy.mock.calls[0]?.[0]);
    expect(warnArg).toContain("__sergeantShellNavigate");
    // Черга лишається undefined — ми не дублюємо у fallback, бо
    // напівдоставлена подія (виняток вже ПІСЛЯ виклику) виглядає для
    // shell-а як доставлена. Повторювати її у чергу → ризик подвійної
    // навігації при наступному install-і bridge-а.
    expect(w.__sergeantShellDeepLinkQueue).toBeUndefined();
  });

  it("існуюча (preserved) черга не перезаписується — pushes акумулюються", async () => {
    // Страхуємось від бажання ненароком зробити `w.queue = [path]`,
    // яке стирало б раніше накопичені cold-start події.
    const mocks = installCapacitorMocks();
    const w = window as BridgeWindow;
    w.__sergeantShellDeepLinkQueue = ["/welcome"];

    const cb = await captureUrlOpenCallback(mocks);
    cb({ url: "com.sergeant.shell://profile" });

    expect(w.__sergeantShellDeepLinkQueue).toEqual(["/welcome", "/profile"]);
  });
});

describe("deep-link bridge — BroadcastChannel canonical path (PR-29)", () => {
  it("publishes parsed path on `sergeant-shell-deeplink` channel alongside window-global fallback", async () => {
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
    cb({ url: "com.sergeant.shell://finyk/transactions/42" });

    await new Promise((r) => setTimeout(r, 0));

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      url: "/finyk/transactions/42",
      source: "shell",
      protocolVersion: 1,
    });

    bcReceiver.close();
  });

  it("does NOT post to BroadcastChannel when `options.navigate` is provided (test-injection short-circuit)", async () => {
    const mocks = installCapacitorMocks();
    const bcReceiver = new BroadcastChannel("sergeant-shell-deeplink");
    const received: unknown[] = [];
    bcReceiver.onmessage = (ev: MessageEvent): void => {
      received.push(ev.data);
    };
    const optionsNav = vi.fn();

    const cb = await captureUrlOpenCallback(mocks, { navigate: optionsNav });
    cb({ url: "com.sergeant.shell://profile" });

    await new Promise((r) => setTimeout(r, 0));

    expect(optionsNav).toHaveBeenCalledWith("/profile");
    expect(received).toHaveLength(0);

    bcReceiver.close();
  });

  it("falls back gracefully when BroadcastChannel constructor is absent in the WebView", async () => {
    // Симулюємо iOS <15.4 / дуже стару Android System WebView: API
    // повністю відсутня у globalThis. dispatchDeepLink має тихо
    // пройти через window-global path.
    const mocks = installCapacitorMocks();
    const originalBC = globalThis.BroadcastChannel;
    delete (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel;

    try {
      const w = window as BridgeWindow;
      const bridgeNav = vi.fn();
      w.__sergeantShellNavigate = bridgeNav;

      const cb = await captureUrlOpenCallback(mocks);
      cb({ url: "com.sergeant.shell://welcome" });

      expect(bridgeNav).toHaveBeenCalledWith("/welcome");
    } finally {
      (
        globalThis as { BroadcastChannel?: typeof BroadcastChannel }
      ).BroadcastChannel = originalBC;
    }
  });
});
