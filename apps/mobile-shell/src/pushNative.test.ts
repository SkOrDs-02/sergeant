import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `pushNative.ts` — boundary-тести для адаптера native push-notification
 * реєстрації. Як і у `auth-storage.test.ts` / `barcodeNative.test.ts`,
 * мокуємо `@capacitor/*` плагіни і перевіряємо контракт:
 *   - guard на не-native платформу,
 *   - permission gate перед register(),
 *   - resolve через `registration` listener,
 *   - reject через `registrationError` listener,
 *   - cache токена у `Preferences` під namespaced ключем,
 *   - ідемпотентність `unsubscribe` навіть при `unregister()` rejection.
 *
 * Слухачі моделюємо як прості реєстри, які тест-сценарій сам тригерить
 * через хелпер `fireRegistration` / `fireRegistrationError`.
 */

const NATIVE_PUSH_TOKEN_KEY = "push.native.token";

type RegistrationToken = { value: string };
type RegistrationFailure = { error: string };
type ListenerKind = "registration" | "registrationError";

type Listener = (payload: RegistrationToken | RegistrationFailure) => void;

const listeners: Record<ListenerKind, Listener[]> = {
  registration: [],
  registrationError: [],
};

const handleRemove = vi.fn<() => Promise<void>>();
let nextHandleFails = false;

const requestPermissions =
  vi.fn<() => Promise<{ receive: "granted" | "denied" | "prompt" }>>();
const removeAllListeners = vi.fn<() => Promise<void>>();
const register = vi.fn<() => Promise<void>>();
const unregister = vi.fn<() => Promise<void>>();
const addListener =
  vi.fn<
    (
      kind: ListenerKind,
      fn: Listener,
    ) => Promise<{ remove: () => Promise<void> }>
  >();

const prefGet =
  vi.fn<(args: { key: string }) => Promise<{ value: string | null }>>();
const prefSet =
  vi.fn<(args: { key: string; value: string }) => Promise<void>>();
const prefRemove = vi.fn<(args: { key: string }) => Promise<void>>();

const getPlatform = vi.fn<() => string>();

vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    requestPermissions: () => requestPermissions(),
    removeAllListeners: () => removeAllListeners(),
    register: () => register(),
    unregister: () => unregister(),
    addListener: (kind: ListenerKind, fn: Listener) => addListener(kind, fn),
  },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: (args: { key: string }) => prefGet(args),
    set: (args: { key: string; value: string }) => prefSet(args),
    remove: (args: { key: string }) => prefRemove(args),
  },
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => getPlatform(),
  },
}));

beforeEach(() => {
  listeners.registration = [];
  listeners.registrationError = [];
  nextHandleFails = false;

  handleRemove.mockReset().mockResolvedValue(undefined);
  requestPermissions.mockReset();
  removeAllListeners.mockReset().mockResolvedValue(undefined);
  register.mockReset().mockResolvedValue(undefined);
  unregister.mockReset().mockResolvedValue(undefined);
  prefGet.mockReset();
  prefSet.mockReset().mockResolvedValue(undefined);
  prefRemove.mockReset().mockResolvedValue(undefined);
  getPlatform.mockReset();

  addListener.mockReset();
  addListener.mockImplementation(async (kind, fn) => {
    if (nextHandleFails) {
      throw new Error("addListener-failed");
    }
    listeners[kind].push(fn);
    return { remove: () => handleRemove() };
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function fireRegistration(token: string): void {
  for (const fn of listeners.registration) fn({ value: token });
}

function fireRegistrationError(message: string): void {
  for (const fn of listeners.registrationError) fn({ error: message });
}

describe("subscribeNativePush — guard layer", () => {
  it("кидає 'push-native-unavailable' на web-платформі", async () => {
    getPlatform.mockReturnValue("web");
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow(
      "push-native-unavailable",
    );

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("кидає 'push-permission-denied', якщо OS відмовила", async () => {
    getPlatform.mockReturnValue("ios");
    requestPermissions.mockResolvedValue({ receive: "denied" });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow(
      "push-permission-denied",
    );

    expect(register).not.toHaveBeenCalled();
    expect(removeAllListeners).not.toHaveBeenCalled();
  });
});

describe("subscribeNativePush — registration flow", () => {
  it("резолвиться токеном від `registration` listener-а і кешує його у Preferences", async () => {
    getPlatform.mockReturnValue("android");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    register.mockImplementation(async () => {
      // Імітуємо OS, що віддає токен ПІСЛЯ register()
      queueMicrotask(() => fireRegistration("fcm-token-123"));
    });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).resolves.toEqual({
      platform: "android",
      token: "fcm-token-123",
    });

    expect(removeAllListeners).toHaveBeenCalled();
    expect(register).toHaveBeenCalledTimes(1);
    expect(prefSet).toHaveBeenCalledWith({
      key: NATIVE_PUSH_TOKEN_KEY,
      value: "fcm-token-123",
    });
  });

  it("реджектиться 'push-registration-empty-token', якщо плагін повернув порожній токен", async () => {
    getPlatform.mockReturnValue("ios");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    register.mockImplementation(async () => {
      queueMicrotask(() => fireRegistration(""));
    });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow(
      "push-registration-empty-token",
    );
    expect(prefSet).not.toHaveBeenCalled();
  });

  it("реджектиться через `registrationError` listener", async () => {
    getPlatform.mockReturnValue("android");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    register.mockImplementation(async () => {
      queueMicrotask(() => fireRegistrationError("FCM_NO_TOKEN"));
    });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow("FCM_NO_TOKEN");
    expect(prefSet).not.toHaveBeenCalled();
  });

  it("ігнорує другий `registration` (settled-once)", async () => {
    getPlatform.mockReturnValue("ios");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    register.mockImplementation(async () => {
      queueMicrotask(() => {
        fireRegistration("first");
        fireRegistration("second");
      });
    });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).resolves.toEqual({
      platform: "ios",
      token: "first",
    });

    expect(prefSet).toHaveBeenCalledTimes(1);
    expect(prefSet).toHaveBeenCalledWith({
      key: NATIVE_PUSH_TOKEN_KEY,
      value: "first",
    });
  });

  it("реджектиться, якщо `register()` синхронно провалився", async () => {
    getPlatform.mockReturnValue("ios");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    register.mockRejectedValue(new Error("apns-not-configured"));
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow("apns-not-configured");
  });

  it("реджектиться, якщо `addListener` сам кидає помилку", async () => {
    getPlatform.mockReturnValue("android");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    nextHandleFails = true;
    register.mockResolvedValue(undefined);
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow("addListener-failed");
  });
});

describe("unsubscribeNativePush", () => {
  it("повертає кешований токен і прибирає всі listener-и + кеш", async () => {
    prefGet.mockResolvedValue({ value: "cached-token" });
    const { unsubscribeNativePush } = await import("./pushNative.js");

    await expect(unsubscribeNativePush()).resolves.toBe("cached-token");

    expect(removeAllListeners).toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
    expect(prefRemove).toHaveBeenCalledWith({ key: NATIVE_PUSH_TOKEN_KEY });
  });

  it("ідемпотентний: ковтає помилку `unregister()` і все одно чистить кеш", async () => {
    prefGet.mockResolvedValue({ value: "cached" });
    unregister.mockRejectedValue(new Error("not-implemented"));
    const { unsubscribeNativePush } = await import("./pushNative.js");

    await expect(unsubscribeNativePush()).resolves.toBe("cached");
    expect(prefRemove).toHaveBeenCalledWith({ key: NATIVE_PUSH_TOKEN_KEY });
  });

  it("повертає null, якщо токен не кешовано", async () => {
    prefGet.mockResolvedValue({ value: null });
    const { unsubscribeNativePush } = await import("./pushNative.js");

    await expect(unsubscribeNativePush()).resolves.toBeNull();
  });

  it("ковтає помилку `Preferences.get` і не валить flow", async () => {
    prefGet.mockRejectedValue(new Error("storage-down"));
    const { unsubscribeNativePush } = await import("./pushNative.js");

    await expect(unsubscribeNativePush()).resolves.toBeNull();
    expect(prefRemove).toHaveBeenCalledWith({ key: NATIVE_PUSH_TOKEN_KEY });
  });
});

describe("getStoredNativePushToken / setStoredNativePushToken / clearStoredNativePushToken", () => {
  it("get — повертає value під namespaced ключем", async () => {
    prefGet.mockResolvedValue({ value: "stored-token" });
    const { getStoredNativePushToken } = await import("./pushNative.js");

    await expect(getStoredNativePushToken()).resolves.toBe("stored-token");
    expect(prefGet).toHaveBeenCalledWith({ key: NATIVE_PUSH_TOKEN_KEY });
  });

  it("get — нормалізує undefined у null", async () => {
    prefGet.mockResolvedValue({ value: undefined as unknown as null });
    const { getStoredNativePushToken } = await import("./pushNative.js");

    await expect(getStoredNativePushToken()).resolves.toBeNull();
  });

  it("get — ковтає помилку Preferences і повертає null", async () => {
    prefGet.mockRejectedValue(new Error("kv-unavailable"));
    const { getStoredNativePushToken } = await import("./pushNative.js");

    await expect(getStoredNativePushToken()).resolves.toBeNull();
  });

  it("set — пише під правильним ключем", async () => {
    const { setStoredNativePushToken } = await import("./pushNative.js");
    await setStoredNativePushToken("fresh");

    expect(prefSet).toHaveBeenCalledWith({
      key: NATIVE_PUSH_TOKEN_KEY,
      value: "fresh",
    });
  });

  it("set — мовчки ковтає помилку Preferences (best-effort кеш)", async () => {
    prefSet.mockRejectedValue(new Error("write-failed"));
    const { setStoredNativePushToken } = await import("./pushNative.js");

    await expect(setStoredNativePushToken("x")).resolves.toBeUndefined();
  });

  it("clear — викликає Preferences.remove і ковтає помилку", async () => {
    prefRemove.mockRejectedValue(new Error("remove-failed"));
    const { clearStoredNativePushToken } = await import("./pushNative.js");

    await expect(clearStoredNativePushToken()).resolves.toBeUndefined();
    expect(prefRemove).toHaveBeenCalledWith({ key: NATIVE_PUSH_TOKEN_KEY });
  });
});
