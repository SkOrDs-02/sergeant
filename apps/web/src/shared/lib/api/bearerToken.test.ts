// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `bearerToken.ts` — це гейт навколо `@sergeant/mobile-shell/auth-storage`:
 *   1. Поза Capacitor (`isCapacitor()=false`) усі три функції — no-op,
 *      ніякого динамічного імпорту взагалі.
 *   2. У Capacitor — делегує до нативного сховища.
 *   3. Якщо динамічний імпорт падає (наприклад, виявилось, що shell не
 *      залінкований у білд) — `getBearerToken` повертає `null`,
 *      `set`/`clear` — тихі no-op. Помилка не пропагує.
 *   4. Якщо модуль резолвиться, але окремий метод кидає — такий самий
 *      резилієнс.
 *
 * Тести побудовані на `vi.doMock` + `vi.resetModules()`, щоб кожен
 * сценарій отримував свіжий модуль з новою конфігурацією моків (інакше
 * `vi.mock` кешувався б між тестами).
 */

const isCapacitorMock = vi.fn<() => boolean>();

// `@sergeant/shared` — єдине, що `bearerToken.ts` імпортує статично.
// Мокуємо тільки `isCapacitor` — решту експорту лишаємо актуальною через
// `importActual`, щоб випадкові транзитивні імпорти не ламались.
vi.mock("@sergeant/shared", async () => {
  const actual =
    await vi.importActual<typeof import("@sergeant/shared")>(
      "@sergeant/shared",
    );
  return { ...actual, isCapacitor: () => isCapacitorMock() };
});

beforeEach(() => {
  vi.resetModules();
  isCapacitorMock.mockReset();
});

afterEach(() => {
  vi.doUnmock("@sergeant/mobile-shell/auth-storage");
  vi.restoreAllMocks();
});

describe("поза Capacitor — все no-op", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(false);
  });

  it("getBearerToken повертає null і НЕ підтягує auth-storage модуль", async () => {
    // Якщо модуль всередині `loadStorage()` все-таки почне резолвитись,
    // мок кине і ми побачимо це у звіті.
    const importSpy = vi.fn(() => {
      throw new Error("dynamic import should not be called in web branch");
    });
    vi.doMock(
      "@sergeant/mobile-shell/auth-storage",
      importSpy as unknown as () => never,
    );

    const { getBearerToken } = await import("./bearerToken");
    await expect(getBearerToken()).resolves.toBeNull();
    expect(importSpy).not.toHaveBeenCalled();
  }, 20_000);

  it("setBearerToken — тихий no-op, не кидає, не викликає storage", async () => {
    const setSpy = vi.fn();
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(),
      setBearerToken: setSpy,
      clearBearerToken: vi.fn(),
    }));

    const { setBearerToken } = await import("./bearerToken");
    await expect(setBearerToken("x")).resolves.toBeUndefined();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("clearBearerToken — тихий no-op, не кидає, не викликає storage", async () => {
    const clearSpy = vi.fn();
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(),
      setBearerToken: vi.fn(),
      clearBearerToken: clearSpy,
    }));

    const { clearBearerToken } = await import("./bearerToken");
    await expect(clearBearerToken()).resolves.toBeUndefined();
    expect(clearSpy).not.toHaveBeenCalled();
  });
});

describe("у Capacitor — делегує до auth-storage", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(true);
  });

  it("getBearerToken делегує до storage.getBearerToken", async () => {
    const storageGet = vi.fn(async () => "tok-42");
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: storageGet,
      setBearerToken: vi.fn(),
      clearBearerToken: vi.fn(),
    }));

    const { getBearerToken } = await import("./bearerToken");
    await expect(getBearerToken()).resolves.toBe("tok-42");
    expect(storageGet).toHaveBeenCalledTimes(1);
  });

  it("setBearerToken делегує до storage.setBearerToken з тим самим токеном", async () => {
    const storageSet = vi.fn(async () => undefined);
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(),
      setBearerToken: storageSet,
      clearBearerToken: vi.fn(),
    }));

    const { setBearerToken } = await import("./bearerToken");
    await setBearerToken("jwt-xyz");
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(storageSet).toHaveBeenCalledWith("jwt-xyz");
  });

  it("clearBearerToken делегує до storage.clearBearerToken", async () => {
    const storageClear = vi.fn(async () => undefined);
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(),
      setBearerToken: vi.fn(),
      clearBearerToken: storageClear,
    }));

    const { clearBearerToken } = await import("./bearerToken");
    await clearBearerToken();
    expect(storageClear).toHaveBeenCalledTimes(1);
  });
});

describe("резилієнс: dynamic import падає", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(true);
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => {
      throw new Error("module resolve failure");
    });
  });

  it("getBearerToken повертає null, не кидає", async () => {
    const { getBearerToken } = await import("./bearerToken");
    await expect(getBearerToken()).resolves.toBeNull();
  });

  it("setBearerToken — тихий no-op, не кидає", async () => {
    const { setBearerToken } = await import("./bearerToken");
    await expect(setBearerToken("x")).resolves.toBeUndefined();
  });

  it("clearBearerToken — тихий no-op, не кидає", async () => {
    const { clearBearerToken } = await import("./bearerToken");
    await expect(clearBearerToken()).resolves.toBeUndefined();
  });
});

describe("резилієнс: модуль резолвиться, але окремий метод кидає", () => {
  beforeEach(() => {
    isCapacitorMock.mockReturnValue(true);
  });

  it("getBearerToken ловить помилку storage і повертає null", async () => {
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(async () => {
        throw new Error("keychain unavailable");
      }),
      setBearerToken: vi.fn(),
      clearBearerToken: vi.fn(),
    }));

    const { getBearerToken } = await import("./bearerToken");
    await expect(getBearerToken()).resolves.toBeNull();
  });

  it("setBearerToken ловить помилку storage і тихо завершується", async () => {
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(),
      setBearerToken: vi.fn(async () => {
        throw new Error("disk full");
      }),
      clearBearerToken: vi.fn(),
    }));

    const { setBearerToken } = await import("./bearerToken");
    await expect(setBearerToken("x")).resolves.toBeUndefined();
  });

  it("clearBearerToken ловить помилку storage і тихо завершується", async () => {
    vi.doMock("@sergeant/mobile-shell/auth-storage", () => ({
      getBearerToken: vi.fn(),
      setBearerToken: vi.fn(),
      clearBearerToken: vi.fn(async () => {
        throw new Error("keychain locked");
      }),
    }));

    const { clearBearerToken } = await import("./bearerToken");
    await expect(clearBearerToken()).resolves.toBeUndefined();
  });
});
