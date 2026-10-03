/** @vitest-environment jsdom */
/**
 * Знахідка B2 (частина 2) браузерного аудиту 2026-08-05. Тестуємо саме
 * правило злиття, бо в ньому й був баг: «локально порожньо» означає «ми
 * не знаємо вибору», а не «людина обрала нічого», — і сплутати ці два
 * стани значить або показати дефолт замість вибору, або затерти вибір.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVibePicks, saveVibePicks } from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";

const getPreferences = vi.fn();
const updatePreferences = vi.fn();

vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: () => getPreferences(),
    updatePreferences: (patch: unknown) => updatePreferences(patch),
  },
}));

const {
  hydrateActiveModules,
  pushActiveModules,
  __resetActiveModulesSyncForTests,
} = await import("./activeModulesSync");

function serverPrefs(activeModules: string[] | null) {
  return {
    analytics: false,
    aiMemory: true,
    pushNotifications: false,
    sergeantNudges: false,
    healthDataConsent: false,
    activeModules,
    updatedAt: null,
  };
}

beforeEach(() => {
  localStorage.clear();
  getPreferences.mockReset();
  updatePreferences.mockReset();
  updatePreferences.mockResolvedValue(serverPrefs([]));
  __resetActiveModulesSyncForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hydrateActiveModules — сервер знає вибір", () => {
  it("перезаписує локальний вибір серверним (сценарій «новий пристрій»)", async () => {
    getPreferences.mockResolvedValue(serverPrefs(["nutrition", "finyk"]));
    await hydrateActiveModules();
    expect(getVibePicks(webKVStore)).toEqual(["nutrition", "finyk"]);
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("зберігає порядок вибору, а не сортує його", async () => {
    saveVibePicks(webKVStore, ["finyk", "nutrition"]);
    getPreferences.mockResolvedValue(serverPrefs(["nutrition", "finyk"]));
    await hydrateActiveModules();
    // Той самий набір, інший порядок — на хабі це різні розкладки, тож
    // порівняння має бути позиційним.
    expect(getVibePicks(webKVStore)).toEqual(["nutrition", "finyk"]);
  });

  it("відсіює невідомий серверний id замість того, щоб його показати", async () => {
    getPreferences.mockResolvedValue(serverPrefs(["finyk", "garage"]));
    await hydrateActiveModules();
    expect(getVibePicks(webKVStore)).toEqual(["finyk"]);
  });

  it("порожній серверний вибір — це вибір: локальний затирається", async () => {
    saveVibePicks(webKVStore, ["finyk", "routine"]);
    getPreferences.mockResolvedValue(serverPrefs([]));
    await hydrateActiveModules();
    expect(getVibePicks(webKVStore)).toEqual([]);
  });
});

describe("hydrateActiveModules — сервер вибору не знає", () => {
  it("доливає локальний вибір угору (міграція існуючих користувачів)", async () => {
    saveVibePicks(webKVStore, ["routine", "fizruk"]);
    getPreferences.mockResolvedValue(serverPrefs(null));
    await hydrateActiveModules();
    expect(updatePreferences).toHaveBeenCalledWith({
      activeModules: ["routine", "fizruk"],
    });
    expect(getVibePicks(webKVStore)).toEqual(["routine", "fizruk"]);
  });

  it("нічого не пише, коли порожньо з обох боків", async () => {
    getPreferences.mockResolvedValue(serverPrefs(null));
    await hydrateActiveModules();
    // Записати `[]` тут означало б «людина свідомо вимкнула все» —
    // а вона просто ще не обирала.
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(getVibePicks(webKVStore)).toEqual([]);
  });
});

describe("pushActiveModules", () => {
  it("не кидає назовні, коли мережа впала", async () => {
    updatePreferences.mockRejectedValue(new Error("offline"));
    expect(() => pushActiveModules(["finyk"])).not.toThrow();
    // Локальний KV уже оновив викликач — push лише догоняє сервер.
    await Promise.resolve();
  });
});

/**
 * Регресія browser-QA 2026-09-02. `pushActiveModules` — fire-and-forget
 * PATCH, гідратація — окремий GET на буті; їхній порядок не гарантований
 * нічим. Послідовність «бут почався → людина обрала модулі → приїхала
 * відповідь бута зі СТАРИМ вибором» затирала свіжий вибір, і хаб на очах
 * відкочувався.
 */
describe("hydrateActiveModules — гонка з вибором людини", () => {
  it("не затирає вибір, зроблений поки запит був у польоті", async () => {
    saveVibePicks(webKVStore, ["finyk", "nutrition"]);
    let releaseServer: (v: unknown) => void = () => {};
    getPreferences.mockReturnValue(
      new Promise((resolve) => {
        releaseServer = resolve;
      }),
    );

    const inFlight = hydrateActiveModules();

    // Людина обирає інше, поки бут ще чекає на відповідь.
    saveVibePicks(webKVStore, ["routine"]);
    pushActiveModules(["routine"]);

    // Сервер відповідає СТАРИМ вибором — він сформував відповідь до вибору.
    releaseServer(serverPrefs(["finyk", "nutrition"]));
    await inFlight;

    expect(getVibePicks(webKVStore)).toEqual(["routine"]);
  });

  it("без вибору в польоті серверна гілка працює як раніше", async () => {
    saveVibePicks(webKVStore, ["routine"]);
    getPreferences.mockResolvedValue(serverPrefs(["finyk", "nutrition"]));
    await hydrateActiveModules();
    expect(getVibePicks(webKVStore)).toEqual(["finyk", "nutrition"]);
  });
});
