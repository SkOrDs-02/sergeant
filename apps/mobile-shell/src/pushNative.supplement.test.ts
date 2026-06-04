import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Доповнення до `pushNative.test.ts` — кейси, яких там немає:
 *   1. `requestPermissions` повертає `"prompt"` → код трактує це як «не
 *      granted» і кидає `"push-permission-denied"` (перевірка умови
 *      `!== "granted"`).
 *   2. `registrationError` надходить із порожнім `error`-полем → `e.error ||
 *      "push-registration-error"` має дати fallback-повідомлення, а не
 *      пустий рядок.
 *
 * Структура моків (`vi.mock`) дзеркалить `pushNative.test.ts`.
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
    listeners[kind].push(fn);
    return { remove: () => handleRemove() };
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function fireRegistrationError(message: string): void {
  for (const fn of listeners.registrationError) fn({ error: message });
}

describe("subscribeNativePush — permission contract", () => {
  it("повертає 'push-permission-denied' коли receive='prompt' (не-granted трактується як відмова)", async () => {
    // `permission.receive !== "granted"` — будь-яке значення, крім "granted",
    // ламає flow. `"prompt"` є валідним iOS-статусом після першого запиту
    // (користувач ще не відповів), і shell не повинен блокуватися у вічному
    // очікуванні: якщо OS повернула щось відмінне від "granted" — це відмова
    // для нашого flow.
    getPlatform.mockReturnValue("ios");
    requestPermissions.mockResolvedValue({ receive: "prompt" });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow(
      "push-permission-denied",
    );

    expect(register).not.toHaveBeenCalled();
  });
});

describe("subscribeNativePush — registrationError з порожнім error-рядком", () => {
  it("використовує fallback 'push-registration-error' коли error='' (e.error || fallback)", async () => {
    // Деякі Android-девайси передають порожній рядок замість null у
    // RegistrationError. Код: `new Error(e.error || "push-registration-error")`
    // має дати читаємий fallback замість `Error("")`.
    getPlatform.mockReturnValue("android");
    requestPermissions.mockResolvedValue({ receive: "granted" });
    register.mockImplementation(async () => {
      queueMicrotask(() => fireRegistrationError(""));
    });
    const { subscribeNativePush } = await import("./pushNative.js");

    await expect(subscribeNativePush()).rejects.toThrow(
      "push-registration-error",
    );

    // Токен не мав зберегтися після помилки реєстрації.
    expect(prefSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ key: NATIVE_PUSH_TOKEN_KEY }),
    );
  });
});
