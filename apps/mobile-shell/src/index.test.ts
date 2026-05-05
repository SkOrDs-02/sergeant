// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Для `initNativeShell()` ми тестуємо лише композицію: що кожен з чотирьох
 * Capacitor-плагінів був викликаний з правильними аргументами, що помилка
 * одного не ламає інші, що виклик ідемпотентний і що `appUrlOpen` listener
 * коректно маршрутизує deep-link. Реальний native-рантайм тут не потрібен.
 *
 * Мокуємо через `vi.doMock` (не `vi.mock`) — чистимо й перевстановлюємо
 * моки в `beforeEach`, а модуль імпортуємо динамічно після налаштування
 * моків. Це дозволяє скинути module-level `initialized` прапор між тестами
 * через `vi.resetModules()`.
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
type BackButtonCallback = (event: { canGoBack: boolean }) => void;

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

beforeEach(() => {
  vi.resetModules();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  vi.doUnmock("@capacitor/status-bar");
  vi.doUnmock("@capacitor/splash-screen");
  vi.doUnmock("@capacitor/keyboard");
  vi.doUnmock("@capacitor/app");
  vi.restoreAllMocks();
});

describe("parseDeepLink", () => {
  it("повертає `/welcome` для `com.sergeant.shell://welcome`", async () => {
    installCapacitorMocks();
    const { parseDeepLink } = await import("./index.js");
    expect(parseDeepLink("com.sergeant.shell://welcome")).toBe("/welcome");
  });

  it("зберігає query+hash: `/welcome?x=1#frag`", async () => {
    installCapacitorMocks();
    const { parseDeepLink } = await import("./index.js");
    expect(parseDeepLink("com.sergeant.shell://welcome?x=1#frag")).toBe(
      "/welcome?x=1#frag",
    );
  });

  it("нормалізує `com.sergeant.shell:///welcome` → `/welcome` (не дублює ведучий `/`)", async () => {
    installCapacitorMocks();
    const { parseDeepLink } = await import("./index.js");
    expect(parseDeepLink("com.sergeant.shell:///welcome")).toBe("/welcome");
  });

  it.each([
    "https://sergeant.app/welcome",
    "foo://welcome",
    "",
    "com.sergeant.shel://welcome", // очепятка в схемі
  ])("повертає null для `%s`", async (url) => {
    installCapacitorMocks();
    const { parseDeepLink } = await import("./index.js");
    expect(parseDeepLink(url)).toBeNull();
  });
});

describe("initNativeShell — композиція плагінів", () => {
  it("викликає StatusBar + SplashScreen + Keyboard + App.addListener з правильними аргументами (light-тема)", async () => {
    const mocks = installCapacitorMocks();
    const { initNativeShell } = await import("./index.js");

    await initNativeShell();

    expect(mocks.StatusBar.setStyle).toHaveBeenCalledTimes(1);
    expect(mocks.StatusBar.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(mocks.StatusBar.setBackgroundColor).toHaveBeenCalledTimes(1);
    expect(mocks.StatusBar.setBackgroundColor).toHaveBeenCalledWith({
      color: "#fdf9f3",
    });
    expect(mocks.SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(mocks.SplashScreen.hide).toHaveBeenCalledWith({
      fadeOutDuration: 250,
    });
    expect(mocks.Keyboard.setResizeMode).toHaveBeenCalledTimes(1);
    expect(mocks.Keyboard.setResizeMode).toHaveBeenCalledWith({ mode: "body" });
    expect(mocks.App.addListener).toHaveBeenCalledTimes(2);
    expect(mocks.App.addListener).toHaveBeenCalledWith(
      "appUrlOpen",
      expect.any(Function),
    );
    expect(mocks.App.addListener).toHaveBeenCalledWith(
      "backButton",
      expect.any(Function),
    );
  });

  it("у dark-темі застосовує dark style + #171412 background", async () => {
    const mocks = installCapacitorMocks();
    document.documentElement.classList.add("dark");

    const { initNativeShell } = await import("./index.js");
    await initNativeShell();

    expect(mocks.StatusBar.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(mocks.StatusBar.setBackgroundColor).toHaveBeenCalledWith({
      color: "#171412",
    });
  });
});

describe("initNativeShell — ідемпотентність", () => {
  it("другий і третій виклики — no-op (лічильники моків не зростають)", async () => {
    const mocks = installCapacitorMocks();
    const { initNativeShell } = await import("./index.js");

    await initNativeShell();
    await initNativeShell();
    await initNativeShell();

    expect(mocks.StatusBar.setStyle).toHaveBeenCalledTimes(1);
    expect(mocks.StatusBar.setBackgroundColor).toHaveBeenCalledTimes(1);
    expect(mocks.SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(mocks.Keyboard.setResizeMode).toHaveBeenCalledTimes(1);
    expect(mocks.App.addListener).toHaveBeenCalledTimes(2);
  });
});

describe("initNativeShell — ізоляція помилок", () => {
  it("якщо StatusBar падає, SplashScreen/Keyboard/App все одно викликаються", async () => {
    const mocks = installCapacitorMocks();
    mocks.StatusBar.setStyle.mockRejectedValueOnce(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { initNativeShell } = await import("./index.js");
    await initNativeShell();

    expect(mocks.SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(mocks.Keyboard.setResizeMode).toHaveBeenCalledTimes(1);
    expect(mocks.App.addListener).toHaveBeenCalledTimes(2);
    // StatusBar warn-повідомлення вилетіло — інакше користувач побачив би
    // лише «мовчки не спрацювало».
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = warnSpy.mock.calls[0]?.[0];
    expect(String(warnArg)).toContain("StatusBar");
  });

  it("якщо SplashScreen.hide падає, App.addListener все одно реєструється", async () => {
    const mocks = installCapacitorMocks();
    mocks.SplashScreen.hide.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { initNativeShell } = await import("./index.js");
    await initNativeShell();

    expect(mocks.App.addListener).toHaveBeenCalledTimes(2);
  });
});

describe("initNativeShell — deep-link listener", () => {
  async function captureUrlOpenCallback(
    mocks: CapacitorMocks,
    options: { navigate?: (path: string) => void } = {},
  ): Promise<UrlOpenCallback> {
    const { initNativeShell } = await import("./index.js");
    await initNativeShell(options);

    const call = mocks.App.addListener.mock.calls[0];
    expect(call?.[0]).toBe("appUrlOpen");
    const cb = call?.[1] as UrlOpenCallback;
    expect(typeof cb).toBe("function");
    return cb;
  }

  it("викликає options.navigate з витягнутим шляхом", async () => {
    const mocks = installCapacitorMocks();
    const navigate = vi.fn();

    const cb = await captureUrlOpenCallback(mocks, { navigate });
    cb({ url: "com.sergeant.shell://profile" });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/profile");
  });

  it("НЕ викликає navigate для чужого URL (https://…)", async () => {
    const mocks = installCapacitorMocks();
    const navigate = vi.fn();

    const cb = await captureUrlOpenCallback(mocks, { navigate });
    cb({ url: "https://example.com" });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("без options.navigate і без `window.__sergeantShellNavigate` — буферизує у `window.__sergeantShellDeepLinkQueue`", async () => {
    // Нова семантика: замість `window.location.assign(path)` (повний
    // reload, втрата state) shell акуратно штовхає path у чергу і чекає,
    // поки React-шар виставить bridge. Веб при маунті роутера drain-ить
    // чергу — див. `apps/web/src/core/app/ShellDeepLinkBridge.tsx`.
    const mocks = installCapacitorMocks();
    const w = window as Window & {
      __sergeantShellNavigate?: (path: string) => void;
      __sergeantShellDeepLinkQueue?: string[];
    };
    delete w.__sergeantShellNavigate;
    delete w.__sergeantShellDeepLinkQueue;

    try {
      const cb = await captureUrlOpenCallback(mocks);
      cb({ url: "com.sergeant.shell://welcome" });

      expect(w.__sergeantShellDeepLinkQueue).toEqual(["/welcome"]);
    } finally {
      delete w.__sergeantShellNavigate;
      delete w.__sergeantShellDeepLinkQueue;
    }
  });
});

describe("initNativeShell — backButton listener", () => {
  async function captureBackButtonCallback(
    mocks: CapacitorMocks,
  ): Promise<BackButtonCallback> {
    const { initNativeShell } = await import("./index.js");
    await initNativeShell();

    const call = mocks.App.addListener.mock.calls.find(
      ([event]) => event === "backButton",
    );
    expect(call?.[0]).toBe("backButton");
    const cb = call?.[1] as BackButtonCallback;
    expect(typeof cb).toBe("function");
    return cb;
  }

  it("реєструє listener на 'backButton' (симетрично до 'appUrlOpen')", async () => {
    const mocks = installCapacitorMocks();
    const { initNativeShell } = await import("./index.js");

    await initNativeShell();

    expect(mocks.App.addListener).toHaveBeenCalledWith(
      "backButton",
      expect.any(Function),
    );
  });

  it("коли canGoBack=true → window.history.back(), App.exitApp — НЕ викликається", async () => {
    const mocks = installCapacitorMocks();
    const historyBackSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});

    const cb = await captureBackButtonCallback(mocks);
    cb({ canGoBack: true });

    expect(historyBackSpy).toHaveBeenCalledTimes(1);
    expect(mocks.App.exitApp).not.toHaveBeenCalled();
  });

  // M20 — press-back-twice-to-exit. Перший тап лише диспатчить hint-подію
  // і виставляє таймер; ТІЛЬКИ другий тап у вікні `BACK_TO_EXIT_WINDOW_MS`
  // викликає `App.exitApp()`. Це закриває M20 hardening-карту: racy
  // deep-link / випадковий тап більше не закривають додаток до того, як
  // стейт-зміна (наприклад, revoke session) зафіксувалась.
  it("M20: коли canGoBack=false → перший тап НЕ викликає exitApp, лише диспатчить back-hint", async () => {
    const mocks = installCapacitorMocks();
    const historyBackSpy = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => {});
    const hintListener = vi.fn();
    window.addEventListener("mobileshell:back-hint", hintListener);

    const cb = await captureBackButtonCallback(mocks);
    cb({ canGoBack: false });

    expect(mocks.App.exitApp).not.toHaveBeenCalled();
    expect(historyBackSpy).not.toHaveBeenCalled();
    expect(hintListener).toHaveBeenCalledTimes(1);
    const [event] = hintListener.mock.calls[0] as [
      CustomEvent<{
        windowMs: number;
      }>,
    ];
    expect(event.detail).toMatchObject({ windowMs: 2000 });

    window.removeEventListener("mobileshell:back-hint", hintListener);
  });

  it("M20: два тапи у вікні 2с → exitApp() викликається після другого", async () => {
    const mocks = installCapacitorMocks();
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(1_000_000);

    const cb = await captureBackButtonCallback(mocks);
    cb({ canGoBack: false });
    expect(mocks.App.exitApp).not.toHaveBeenCalled();

    dateSpy.mockReturnValue(1_000_000 + 1500);
    cb({ canGoBack: false });
    expect(mocks.App.exitApp).toHaveBeenCalledTimes(1);
  });

  it("M20: два тапи з інтервалом > 2с → НЕ виходить, лічильник перезапускається", async () => {
    const mocks = installCapacitorMocks();
    const hintListener = vi.fn();
    window.addEventListener("mobileshell:back-hint", hintListener);
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    const cb = await captureBackButtonCallback(mocks);
    cb({ canGoBack: false });
    dateSpy.mockReturnValue(2_000_000 + 3000); // 3 секунди > 2 секунди
    cb({ canGoBack: false });

    expect(mocks.App.exitApp).not.toHaveBeenCalled();
    // Обидва тапи дають hint-подію; вікно скинулось.
    expect(hintListener).toHaveBeenCalledTimes(2);

    window.removeEventListener("mobileshell:back-hint", hintListener);
  });

  it("M20: успішний history.back на проміжному екрані скидає лічильник exit-вікна", async () => {
    const mocks = installCapacitorMocks();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(3_000_000);

    const cb = await captureBackButtonCallback(mocks);
    cb({ canGoBack: false }); // перший тап на корені → виставив таймер
    dateSpy.mockReturnValue(3_000_000 + 100);
    cb({ canGoBack: true }); // user перейшов на не-кореневий маршрут і назад
    dateSpy.mockReturnValue(3_000_000 + 200);
    cb({ canGoBack: false }); // знову на корені — це має бути нове вікно

    expect(mocks.App.exitApp).not.toHaveBeenCalled();
  });

  it("якщо addListener('backButton') падає — інші плагін-ініти НЕ ламаються", async () => {
    const mocks = installCapacitorMocks();
    // `appUrlOpen` реєструється першим виклик — хай резолвиться, а другий
    // (`backButton`) хай падає. Це повторює шаблон resilience-тестів вище.
    mocks.App.addListener
      .mockResolvedValueOnce({ remove: vi.fn() })
      .mockRejectedValueOnce(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { initNativeShell } = await import("./index.js");
    await initNativeShell();

    expect(mocks.StatusBar.setStyle).toHaveBeenCalledTimes(1);
    expect(mocks.SplashScreen.hide).toHaveBeenCalledTimes(1);
    expect(mocks.Keyboard.setResizeMode).toHaveBeenCalledTimes(1);
    expect(mocks.App.addListener).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnArgs.some((m) => m.includes("backButton"))).toBe(true);
  });
});
