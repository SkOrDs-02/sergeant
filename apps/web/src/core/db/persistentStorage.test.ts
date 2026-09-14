// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` піднімається на верх файлу, тож фабрика не може читати змінні
// модуля — спаї живуть усередині неї, а тест дістає їх через `vi.mocked`.
vi.mock("../observability/sentry", () => ({
  addSentryBreadcrumb: vi.fn(),
  setSentryTag: vi.fn(),
}));

import { addSentryBreadcrumb, setSentryTag } from "../observability/sentry";
import { requestPersistentStorage } from "./persistentStorage";

/**
 * Запит постійного сховища.
 *
 * Звіт власника 2026-09-14: у черзі 1356 операцій, яких немає на сервері,
 * тобто локальна копія для них ЄДИНА — а типове сховище браузер витирає
 * першим під тиском місця. Застосунок цього не просив узагалі.
 */
function stubStorage(value: unknown): void {
  Object.defineProperty(globalThis.navigator, "storage", {
    value,
    configurable: true,
  });
}

describe("requestPersistentStorage", () => {
  beforeEach(() => {
    vi.mocked(addSentryBreadcrumb).mockClear();
    vi.mocked(setSentryTag).mockClear();
  });

  afterEach(() => {
    stubStorage(undefined);
  });

  it("не питає вдруге, коли сховище вже постійне", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => true, persist });

    await expect(requestPersistentStorage()).resolves.toBe("already-persisted");
    // Повторний запит у вже постійному сховищі безглуздий, а подекуди ще й
    // показує користувачу діалог дозволу.
    expect(persist).not.toHaveBeenCalled();
    expect(setSentryTag).toHaveBeenCalledWith(
      "storage.persisted",
      "already-persisted",
    );
  });

  it("просить постійність, коли сховище тимчасове", async () => {
    const persist = vi.fn(async () => true);
    stubStorage({ persisted: async () => false, persist });

    await expect(requestPersistentStorage()).resolves.toBe("granted");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("відмова браузера — не помилка, лише тег", async () => {
    stubStorage({ persisted: async () => false, persist: async () => false });

    // Застосунок мусить працювати однаково з постійним і тимчасовим
    // сховищем, тож `denied` не має ставати винятком чи гейтом.
    await expect(requestPersistentStorage()).resolves.toBe("denied");
    expect(setSentryTag).toHaveBeenCalledWith("storage.persisted", "denied");
  });

  it("переживає виняток із самого API", async () => {
    stubStorage({
      persisted: async () => {
        throw new Error("nope");
      },
      persist: async () => true,
    });

    await expect(requestPersistentStorage()).resolves.toBe("failed");
  });

  it("мовчки здається там, де API немає", async () => {
    stubStorage(undefined);

    await expect(requestPersistentStorage()).resolves.toBe("unsupported");
    // Без API немає про що звітувати — тег лишається нестягнутим.
    expect(setSentryTag).not.toHaveBeenCalled();
  });
});
