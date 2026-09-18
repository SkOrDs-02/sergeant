import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Доповнення до `auth-storage.test.ts` — кейси defensive cleanup
 * (`Preferences.remove` у `setBearerToken` і `clearBearerToken`), де
 * виняток навмисно ковтається:
 *
 *   - `setBearerToken`: після успішного `SecureStorage.set` викликається
 *     `Preferences.remove({ key })` у try/catch. Якщо він кидає, помилка
 *     не повинна пробиватися до caller-а — `setBearerToken` має resolve-нутися
 *     нормально.
 *   - `clearBearerToken`: симетрично — після `SecureStorage.remove` теж
 *     є legacy-cleanup `Preferences.remove` у try/catch.
 *
 * Структура моків (`vi.mock`) дзеркалить `auth-storage.test.ts`.
 */

const BEARER_KEY = "auth.bearer";

const prefsGet =
  vi.fn<(args: { key: string }) => Promise<{ value: string | null }>>();
const prefsSet =
  vi.fn<(args: { key: string; value: string }) => Promise<void>>();
const prefsRemove = vi.fn<(args: { key: string }) => Promise<void>>();

const secureGet = vi.fn<(key: string) => Promise<string | null>>();
const secureSet = vi.fn<(key: string, value: string) => Promise<void>>();
const secureRemove = vi.fn<(key: string) => Promise<boolean>>();
const setSynchronize = vi.fn<(sync: boolean) => Promise<void>>();
const setDefaultKeychainAccess = vi.fn<(access: number) => Promise<void>>();

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: (args: { key: string }) => prefsGet(args),
    set: (args: { key: string; value: string }) => prefsSet(args),
    remove: (args: { key: string }) => prefsRemove(args),
  },
}));

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  KeychainAccess: {
    whenUnlocked: 0,
    whenUnlockedThisDeviceOnly: 1,
    afterFirstUnlock: 2,
    afterFirstUnlockThisDeviceOnly: 3,
    whenPasscodeSetThisDeviceOnly: 4,
  },
  SecureStorage: {
    get: (key: string) => secureGet(key),
    set: (key: string, value: string) => secureSet(key, value),
    remove: (key: string) => secureRemove(key),
    setSynchronize: (sync: boolean) => setSynchronize(sync),
    setDefaultKeychainAccess: (access: number) =>
      setDefaultKeychainAccess(access),
  },
}));

beforeEach(async () => {
  prefsGet.mockReset();
  prefsSet.mockReset();
  prefsRemove.mockReset();
  secureGet.mockReset();
  secureSet.mockReset();
  secureRemove.mockReset();
  setSynchronize.mockReset();
  setDefaultKeychainAccess.mockReset();

  // Конфігурацію залишаємо успішною — нас цікавить legacy-cleanup.
  setSynchronize.mockResolvedValue(undefined);
  setDefaultKeychainAccess.mockResolvedValue(undefined);

  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("setBearerToken — defensive legacy-cleanup", () => {
  it("resolve-ується нормально, якщо Preferences.remove кидає після успішного SecureStorage.set", async () => {
    // Цей шлях захищає від ситуації, де legacy-storage недоступний або
    // вже видалений між двома mount-ами WebView. Помилка cleanup не
    // повинна доходити до UI-шару, бо токен вже безпечно збережений у
    // secure-storage.
    secureSet.mockResolvedValue(undefined);
    prefsRemove.mockRejectedValue(new Error("preferences-unavailable"));
    const { setBearerToken } = await import("./auth-storage.js");

    await expect(setBearerToken("token-x")).resolves.toBeUndefined();

    // Основна операція відбулась — secure-storage записав токен.
    expect(secureSet).toHaveBeenCalledWith(BEARER_KEY, "token-x");
    // Cleanup намагався відбутися — помилка ковтнута.
    expect(prefsRemove).toHaveBeenCalledWith({ key: BEARER_KEY });
  });
});

describe("clearBearerToken — defensive legacy-cleanup", () => {
  it("resolve-ується нормально, якщо Preferences.remove кидає після успішного SecureStorage.remove", async () => {
    // Симетричний до `setBearerToken` сценарій: на sign-out-і основне
    // видалення з secure-storage вдалось, але legacy-cleanup впав.
    // Стан «виключено» має настати для UI незалежно від legacy-cleanup.
    secureRemove.mockResolvedValue(true);
    prefsRemove.mockRejectedValue(new Error("legacy-not-found"));
    const { clearBearerToken } = await import("./auth-storage.js");

    await expect(clearBearerToken()).resolves.toBeUndefined();

    expect(secureRemove).toHaveBeenCalledWith(BEARER_KEY);
    expect(prefsRemove).toHaveBeenCalledWith({ key: BEARER_KEY });
  });
});
