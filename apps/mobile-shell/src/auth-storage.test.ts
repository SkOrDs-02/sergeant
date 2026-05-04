import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `auth-storage.ts` — обгортка над `@aparajita/capacitor-secure-storage`
 * (iOS Keychain з `afterFirstUnlockThisDeviceOnly` + `synchronize=false`,
 * Android EncryptedSharedPreferences). Тести покривають: контракт виклику,
 * конфігурацію secure-storage, lazy-міграцію з legacy `@capacitor/preferences`.
 *
 * Реальні нативні плагіни мокаємо — ми перевіряємо саме hardening-контракт
 * (тобто, що ми просимо плагін зашифрувати з правильними прапорцями), а не
 * реальну поведінку Keychain-у (це integration-test-territory).
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
  // Enum-подібний об'єкт; реальні значення — числа, але достатньо
  // мати об'єкт із потрібним ключем для assertion-у.
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

  // Default-успішні mock-и для конфігурації.
  setSynchronize.mockResolvedValue(undefined);
  setDefaultKeychainAccess.mockResolvedValue(undefined);
  prefsRemove.mockResolvedValue(undefined);

  // Скидаємо лазі-стейт у модулі — щоб ensureConfigured() / migration
  // запускались знову у кожному тесті.
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ensureConfigured (H1 hardening contract)", () => {
  it("на першому виклику виставляє synchronize=false", async () => {
    secureGet.mockResolvedValue("jwt-abc");
    const { getBearerToken } = await import("./auth-storage.js");

    await getBearerToken();

    expect(setSynchronize).toHaveBeenCalledTimes(1);
    expect(setSynchronize).toHaveBeenCalledWith(false);
  });

  it("на першому виклику виставляє defaultKeychainAccess=afterFirstUnlockThisDeviceOnly", async () => {
    secureGet.mockResolvedValue("jwt-abc");
    const { getBearerToken } = await import("./auth-storage.js");

    await getBearerToken();

    expect(setDefaultKeychainAccess).toHaveBeenCalledTimes(1);
    // 3 = `afterFirstUnlockThisDeviceOnly` у нашому mock-енумі.
    expect(setDefaultKeychainAccess).toHaveBeenCalledWith(3);
  });

  it("викликає setSynchronize/setDefaultKeychainAccess лише один раз для серії викликів", async () => {
    secureGet.mockResolvedValue("jwt-abc");
    const { getBearerToken, setBearerToken, clearBearerToken } =
      await import("./auth-storage.js");

    await getBearerToken();
    await setBearerToken("new");
    await clearBearerToken();

    expect(setSynchronize).toHaveBeenCalledTimes(1);
    expect(setDefaultKeychainAccess).toHaveBeenCalledTimes(1);
  });

  it("якщо setSynchronize кидає — getBearerToken продовжує працювати", async () => {
    setSynchronize.mockRejectedValue(new Error("native plugin missing"));
    secureGet.mockResolvedValue("jwt-abc");
    const { getBearerToken } = await import("./auth-storage.js");

    await expect(getBearerToken()).resolves.toBe("jwt-abc");
  });
});

describe("getBearerToken", () => {
  it("повертає значення із secure-storage без виклику legacy", async () => {
    secureGet.mockResolvedValue("jwt-abc");
    const { getBearerToken } = await import("./auth-storage.js");

    const result = await getBearerToken();

    expect(result).toBe("jwt-abc");
    expect(secureGet).toHaveBeenCalledTimes(1);
    expect(secureGet).toHaveBeenCalledWith(BEARER_KEY);
    expect(prefsGet).not.toHaveBeenCalled();
  });

  it("повертає null, якщо ні secure-storage, ні legacy не мають значення", async () => {
    secureGet.mockResolvedValue(null);
    prefsGet.mockResolvedValue({ value: null });
    const { getBearerToken } = await import("./auth-storage.js");

    await expect(getBearerToken()).resolves.toBeNull();
  });

  it("пробрасує помилку із secure-storage (legacy НЕ читається)", async () => {
    secureGet.mockRejectedValue(new Error("storage unavailable"));
    const { getBearerToken } = await import("./auth-storage.js");

    await expect(getBearerToken()).rejects.toThrow("storage unavailable");
    expect(prefsGet).not.toHaveBeenCalled();
  });
});

describe("legacy migration (H1 — користувачі, що логінились до фіксу)", () => {
  it("першим read-ом мігрує токен із @capacitor/preferences у secure-storage і чистить legacy", async () => {
    secureGet.mockResolvedValue(null); // у secure-storage нічого нема
    prefsGet.mockResolvedValue({ value: "legacy-jwt" });
    secureSet.mockResolvedValue(undefined);

    const { getBearerToken } = await import("./auth-storage.js");

    const result = await getBearerToken();

    expect(result).toBe("legacy-jwt");
    expect(secureSet).toHaveBeenCalledWith(BEARER_KEY, "legacy-jwt");
    expect(prefsRemove).toHaveBeenCalledWith({ key: BEARER_KEY });
  });

  it("якщо secure-storage.set() кидає — повертає legacy-токен без видалення", async () => {
    secureGet.mockResolvedValue(null);
    prefsGet.mockResolvedValue({ value: "legacy-jwt" });
    secureSet.mockRejectedValue(new Error("secure-storage write failed"));

    const { getBearerToken } = await import("./auth-storage.js");

    const result = await getBearerToken();

    expect(result).toBe("legacy-jwt");
    // НЕ викликаємо remove, бо токен лишається у legacy для наступної спроби.
    expect(prefsRemove).not.toHaveBeenCalled();
  });

  it("якщо у legacy теж нічого — повертає null без побічних викликів", async () => {
    secureGet.mockResolvedValue(null);
    prefsGet.mockResolvedValue({ value: null });

    const { getBearerToken } = await import("./auth-storage.js");

    const result = await getBearerToken();

    expect(result).toBeNull();
    expect(secureSet).not.toHaveBeenCalled();
    expect(prefsRemove).not.toHaveBeenCalled();
  });

  it("міграція виконується тільки один раз для серії читань", async () => {
    secureGet.mockResolvedValue(null);
    prefsGet.mockResolvedValue({ value: "legacy-jwt" });
    secureSet.mockResolvedValue(undefined);

    const { getBearerToken } = await import("./auth-storage.js");

    await getBearerToken();
    await getBearerToken();
    await getBearerToken();

    expect(prefsGet).toHaveBeenCalledTimes(1);
    expect(secureSet).toHaveBeenCalledTimes(1);
    expect(prefsRemove).toHaveBeenCalledTimes(1);
  });
});

describe("setBearerToken", () => {
  it("записує у secure-storage і чистить legacy-prefs", async () => {
    secureSet.mockResolvedValue(undefined);
    const { setBearerToken } = await import("./auth-storage.js");

    await setBearerToken("new-token");

    expect(secureSet).toHaveBeenCalledTimes(1);
    expect(secureSet).toHaveBeenCalledWith(BEARER_KEY, "new-token");
    expect(prefsRemove).toHaveBeenCalledWith({ key: BEARER_KEY });
  });

  it("пробрасує виняток із secure-storage", async () => {
    secureSet.mockRejectedValue(new Error("quota exceeded"));
    const { setBearerToken } = await import("./auth-storage.js");

    await expect(setBearerToken("some-token")).rejects.toThrow(
      "quota exceeded",
    );
  });
});

describe("clearBearerToken", () => {
  it("видаляє з secure-storage і з legacy-prefs", async () => {
    secureRemove.mockResolvedValue(true);
    const { clearBearerToken } = await import("./auth-storage.js");

    await clearBearerToken();

    expect(secureRemove).toHaveBeenCalledTimes(1);
    expect(secureRemove).toHaveBeenCalledWith(BEARER_KEY);
    expect(prefsRemove).toHaveBeenCalledWith({ key: BEARER_KEY });
  });

  it("пробрасує виняток від secure-storage.remove", async () => {
    secureRemove.mockRejectedValue(new Error("permission denied"));
    const { clearBearerToken } = await import("./auth-storage.js");

    await expect(clearBearerToken()).rejects.toThrow("permission denied");
  });
});
