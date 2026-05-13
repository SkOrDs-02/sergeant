/**
 * Capacitor Boundary Tests — T2.
 *
 * Verify the contract between `@sergeant/web` and `@sergeant/mobile-shell`:
 *   - Web compatibility: exports are importable, platform detection works,
 *     no native-only symbols leak into web context.
 *   - Native bridge: every Capacitor plugin adapter is accessible and
 *     maintains its public API shape.
 *   - Deep links: custom scheme + universal links are parsed and sanitized.
 *
 * All tests mock Capacitor plugins; no real native runtime is required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────
// Shared mock setup
// ─────────────────────────────────────────────────────────────────────

function installCoreMocks() {
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
});

afterEach(() => {
  vi.doUnmock("@capacitor/status-bar");
  vi.doUnmock("@capacitor/splash-screen");
  vi.doUnmock("@capacitor/keyboard");
  vi.doUnmock("@capacitor/app");
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@capacitor/preferences");
  vi.doUnmock("@capacitor-mlkit/barcode-scanning");
  vi.doUnmock("@aparajita/capacitor-secure-storage");
  vi.doUnmock("@capacitor/push-notifications");
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// 1. Web Compatibility
// ─────────────────────────────────────────────────────────────────────

describe("Web Compatibility", () => {
  it("index module exports initNativeShell without errors", async () => {
    installCoreMocks();
    const mod = await import("../index.js");
    expect(typeof mod.initNativeShell).toBe("function");
  });

  it("index module exports parseDeepLink and isSafeShellPath", async () => {
    installCoreMocks();
    const mod = await import("../index.js");
    expect(typeof mod.parseDeepLink).toBe("function");
    expect(typeof mod.isSafeShellPath).toBe("function");
  });

  it("ALLOWED_DEEP_LINK_PATH_PREFIXES is a frozen non-empty array", async () => {
    installCoreMocks();
    const { ALLOWED_DEEP_LINK_PATH_PREFIXES } = await import("../index.js");
    expect(Array.isArray(ALLOWED_DEEP_LINK_PATH_PREFIXES)).toBe(true);
    expect(ALLOWED_DEEP_LINK_PATH_PREFIXES.length).toBeGreaterThan(0);
    expect(Object.isFrozen(ALLOWED_DEEP_LINK_PATH_PREFIXES)).toBe(true);
  });

  it("DEEP_LINK_HTTPS_HOSTS is a frozen non-empty array", async () => {
    installCoreMocks();
    const { DEEP_LINK_HTTPS_HOSTS } = await import("../index.js");
    expect(Array.isArray(DEEP_LINK_HTTPS_HOSTS)).toBe(true);
    expect(DEEP_LINK_HTTPS_HOSTS.length).toBeGreaterThan(0);
    expect(Object.isFrozen(DEEP_LINK_HTTPS_HOSTS)).toBe(true);
  });

  it("platform module exports isCapacitor and getPlatform", async () => {
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => "web",
      },
    }));
    const mod = await import("../platform.js");
    expect(typeof mod.isCapacitor).toBe("function");
    expect(typeof mod.getPlatform).toBe("function");
  });

  it("isCapacitor returns false when not in native context", async () => {
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => "web",
      },
    }));
    const { isCapacitor, getPlatform } = await import("../platform.js");
    expect(isCapacitor()).toBe(false);
    expect(getPlatform()).toBe("web");
  });

  it("no unsupported APIs leak: initNativeShell is callable without crashing on plugin errors", async () => {
    const mocks = installCoreMocks();
    mocks.StatusBar.setStyle.mockRejectedValue(new Error("not available"));
    const { initNativeShell } = await import("../index.js");
    await expect(initNativeShell()).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Native Bridge — plugin accessibility
// ─────────────────────────────────────────────────────────────────────

describe("Native Bridge", () => {
  it("StatusBar plugin is accessible via initNativeShell", async () => {
    const mocks = installCoreMocks();
    const { initNativeShell } = await import("../index.js");
    await initNativeShell();
    expect(mocks.StatusBar.setStyle).toHaveBeenCalled();
    expect(mocks.StatusBar.setBackgroundColor).toHaveBeenCalled();
  });

  it("SplashScreen plugin is accessible via initNativeShell", async () => {
    const mocks = installCoreMocks();
    const { initNativeShell } = await import("../index.js");
    await initNativeShell();
    expect(mocks.SplashScreen.hide).toHaveBeenCalledWith(
      expect.objectContaining({ fadeOutDuration: expect.any(Number) }),
    );
  });

  it("Keyboard plugin is accessible via initNativeShell", async () => {
    const mocks = installCoreMocks();
    const { initNativeShell } = await import("../index.js");
    await initNativeShell();
    expect(mocks.Keyboard.setResizeMode).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "body" }),
    );
  });

  it("App plugin registers listeners for appUrlOpen and backButton", async () => {
    const mocks = installCoreMocks();
    const { initNativeShell } = await import("../index.js");
    await initNativeShell();
    const events = (
      mocks.App.addListener.mock.calls as [string, unknown][]
    ).map((c) => c[0]);
    expect(events).toContain("appUrlOpen");
    expect(events).toContain("backButton");
  });

  it("Preferences plugin is accessible from auth-storage adapter", async () => {
    const prefsGet = vi.fn().mockResolvedValue({ value: null });
    vi.doMock("@capacitor/preferences", () => ({
      Preferences: {
        get: prefsGet,
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    }));
    vi.doMock("@aparajita/capacitor-secure-storage", () => ({
      SecureStorage: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(true),
        setSynchronize: vi.fn().mockResolvedValue(undefined),
        setDefaultKeychainAccess: vi.fn().mockResolvedValue(undefined),
      },
      KeychainAccess: { afterFirstUnlockThisDeviceOnly: 4 },
    }));
    const { getBearerToken } = await import("../auth-storage.js");
    const token = await getBearerToken();
    expect(token).toBeNull();
  });

  it("SecureStorage plugin is accessible from auth-storage adapter", async () => {
    const secureGet = vi.fn().mockResolvedValue("test-token");
    vi.doMock("@capacitor/preferences", () => ({
      Preferences: {
        get: vi.fn().mockResolvedValue({ value: null }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    }));
    vi.doMock("@aparajita/capacitor-secure-storage", () => ({
      SecureStorage: {
        get: secureGet,
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(true),
        setSynchronize: vi.fn().mockResolvedValue(undefined),
        setDefaultKeychainAccess: vi.fn().mockResolvedValue(undefined),
      },
      KeychainAccess: { afterFirstUnlockThisDeviceOnly: 4 },
    }));
    const { getBearerToken } = await import("../auth-storage.js");
    const token = await getBearerToken();
    expect(token).toBe("test-token");
  });

  it("BarcodeScanner plugin is accessible from barcode adapter", async () => {
    const checkPermissions = vi.fn().mockResolvedValue({ camera: "granted" });
    const scan = vi.fn().mockResolvedValue({
      barcodes: [{ rawValue: "12345", format: "EAN_13" }],
    });
    vi.doMock("@capacitor-mlkit/barcode-scanning", () => ({
      BarcodeScanner: {
        checkPermissions,
        requestPermissions: vi.fn(),
        scan,
      },
    }));
    const { scanBarcodeNative } = await import("../barcodeNative.js");
    const result = await scanBarcodeNative();
    expect(result).toEqual({ code: "12345", format: "EAN_13" });
  });

  it("PushNotifications plugin is accessible from push adapter", async () => {
    vi.doMock("@capacitor/core", () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
      },
    }));
    const removeAllListeners = vi.fn().mockResolvedValue(undefined);
    const requestPermissions = vi
      .fn()
      .mockResolvedValue({ receive: "granted" });
    const register = vi.fn().mockResolvedValue(undefined);
    const addListener = vi
      .fn()
      .mockImplementation(
        (event: string, cb: (payload: { value: string }) => void) => {
          if (event === "registration") {
            setTimeout(() => cb({ value: "fcm-token-abc" }), 0);
          }
          return Promise.resolve({ remove: vi.fn() });
        },
      );
    vi.doMock("@capacitor/push-notifications", () => ({
      PushNotifications: {
        removeAllListeners,
        requestPermissions,
        register,
        addListener,
        unregister: vi.fn().mockResolvedValue(undefined),
      },
    }));
    vi.doMock("@capacitor/preferences", () => ({
      Preferences: {
        get: vi.fn().mockResolvedValue({ value: null }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    }));
    const { subscribeNativePush } = await import("../pushNative.js");
    const sub = await subscribeNativePush();
    expect(sub).toEqual({ platform: "android", token: "fcm-token-abc" });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Deep Links
// ─────────────────────────────────────────────────────────────────────

describe("Deep Links", () => {
  it("handles sergeant:// custom scheme", async () => {
    installCoreMocks();
    const { parseDeepLink } = await import("../index.js");
    expect(parseDeepLink("com.sergeant.shell://finyk")).toBe("/finyk");
  });

  it("handles universal links from allowed HTTPS hosts", async () => {
    installCoreMocks();
    const { parseDeepLink, DEEP_LINK_HTTPS_HOSTS } =
      await import("../index.js");
    for (const host of DEEP_LINK_HTTPS_HOSTS) {
      expect(parseDeepLink(`https://${host}/chat`)).toBe("/chat");
    }
  });

  it("rejects unknown HTTPS hosts", async () => {
    installCoreMocks();
    const { parseDeepLink } = await import("../index.js");
    expect(parseDeepLink("https://evil.com/chat")).toBeNull();
  });

  it("sanitizes XSS vectors in deep link paths", async () => {
    installCoreMocks();
    const { isSafeShellPath } = await import("../index.js");
    expect(isSafeShellPath("javascript:alert(1)")).toBe(false);
    expect(isSafeShellPath("data:text/html,<h1>pwned</h1>")).toBe(false);
    expect(isSafeShellPath("vbscript:msgbox")).toBe(false);
    expect(isSafeShellPath("/chat?next=javascript:alert(1)")).toBe(false);
  });

  it("rejects protocol-relative paths", async () => {
    installCoreMocks();
    const { isSafeShellPath } = await import("../index.js");
    expect(isSafeShellPath("//evil.com/chat")).toBe(false);
  });

  it("allows all registered path prefixes", async () => {
    installCoreMocks();
    const { isSafeShellPath, ALLOWED_DEEP_LINK_PATH_PREFIXES } =
      await import("../index.js");
    for (const prefix of ALLOWED_DEEP_LINK_PATH_PREFIXES) {
      expect(isSafeShellPath(prefix)).toBe(true);
    }
  });

  it("allows root path and root with query/fragment", async () => {
    installCoreMocks();
    const { isSafeShellPath } = await import("../index.js");
    expect(isSafeShellPath("/")).toBe(true);
    expect(isSafeShellPath("/?ref=push")).toBe(true);
    expect(isSafeShellPath("/#section")).toBe(true);
  });

  it("rejects empty and non-slash paths", async () => {
    installCoreMocks();
    const { isSafeShellPath } = await import("../index.js");
    expect(isSafeShellPath("")).toBe(false);
    expect(isSafeShellPath("chat")).toBe(false);
    expect(isSafeShellPath("about:blank")).toBe(false);
  });
});
