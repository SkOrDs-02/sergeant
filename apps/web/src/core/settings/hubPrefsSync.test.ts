/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * PR-S13 (продуктовий огляд 2026-09-13, рішення founder-а 2026-09-14).
 * Тестуємо саме правило злиття, бо ризик тут той самий, що колись був у
 * `activeModules`: «локально дефолти» і «людина свідомо лишила дефолти» —
 * різні стани, і сплутати їх означає або показати чужі налаштування, або
 * затерти свої.
 *
 * Break-тести прогнані фактично (`sergeant-bugfix-and-regression`), і ось
 * що саме вони дали:
 *
 *  - прибрати гард гонки (`prefsGeneration !== generationAtStart`) →
 *    падає РІВНО один тест, «не застосовує серверний стан…»;
 *  - вимкнути серверну гілку (`if (prefs.hubPrefs !== null …)`) → падають
 *    ДВА: «серверні налаштування виграють» і «порожній обʼєкт — це
 *    «знаю»».
 *
 * Перша редакція тесту на гонку була ПОРОЖНЬОЮ — вона проходила і зі
 * знятим гардом, бо не писала локально те, що «щойно перемкнула людина».
 * Тест переписано так, щоб він падав; це записано тут навмисно, бо
 * зелений тест на гонку легко сплутати з працюючим гардом.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPreferences = vi.fn();
const updatePreferences = vi.fn();

vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: () => getPreferences(),
    updatePreferences: (patch: unknown) => updatePreferences(patch),
  },
}));

const {
  hydrateHubPrefs,
  pushHubPrefs,
  setHubPrefsSyncEnabled,
  __resetHubPrefsSyncForTests,
} = await import("./hubPrefsSync");

function serverPrefs(hubPrefs: Record<string, unknown> | null) {
  return {
    analytics: false,
    aiMemory: true,
    pushNotifications: false,
    sergeantNudges: false,
    healthDataConsent: false,
    activeModules: null,
    hubPrefs,
    updatedAt: null,
  };
}

/** Локальне сховище-заглушка: тест керує обома боками злиття явно. */
function makeLocal(initial: Record<string, string | number | boolean> = {}) {
  let bag = { ...initial };
  return {
    read: () => ({ ...bag }),
    write: (next: Record<string, string | number | boolean>) => {
      bag = { ...next };
    },
    current: () => bag,
  };
}

beforeEach(() => {
  getPreferences.mockReset();
  updatePreferences.mockReset();
  updatePreferences.mockResolvedValue(serverPrefs(null));
  __resetHubPrefsSyncForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hydrateHubPrefs — три стани серверної відповіді", () => {
  // Головний сценарій знахідки: новий пристрій. Локально дефолти, на
  // акаунті — справжні налаштування.
  it("серверні налаштування виграють, коли сервер їх знає", async () => {
    getPreferences.mockResolvedValue(
      serverPrefs({ calmMode: true, showMotivational: false }),
    );
    const local = makeLocal();

    await hydrateHubPrefs(local.read, local.write);

    expect(local.current()).toEqual({
      calmMode: true,
      showMotivational: false,
    });
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  // Другий бік тієї ж знахідки: людина налаштовувала хаб ДО міграції 137.
  it("локальні доливаються вгору, коли сервер не знає", async () => {
    getPreferences.mockResolvedValue(serverPrefs(null));
    const local = makeLocal({ calmMode: true });

    await hydrateHubPrefs(local.read, local.write);

    expect(updatePreferences).toHaveBeenCalledWith({
      hubPrefs: { calmMode: true },
    });
    // Локальні при цьому НЕ чіпаємо: вони вже правильні.
    expect(local.current()).toEqual({ calmMode: true });
  });

  it("порожній обʼєкт від сервера — це «знаю», а не «не знаю»", async () => {
    // Різниця, заради якої колонка nullable і без DEFAULT. `{}` означає,
    // що людина свідомо лишила все дефолтним на іншому пристрої, тож
    // локальні значення мають бути стерті, а не долиті вгору.
    getPreferences.mockResolvedValue(serverPrefs({}));
    const local = makeLocal({ calmMode: true });

    await hydrateHubPrefs(local.read, local.write);

    expect(local.current()).toEqual({});
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("обидва порожні — не пишемо нічого", async () => {
    // Записати `{}` тут означало б збрехати серверу: «людина свідомо
    // лишила дефолти», хоча вона просто ще не заходила в налаштування.
    getPreferences.mockResolvedValue(serverPrefs(null));
    const local = makeLocal();

    await hydrateHubPrefs(local.read, local.write);

    expect(updatePreferences).not.toHaveBeenCalled();
    expect(local.current()).toEqual({});
  });

  it("однакові мішки не викликають зайвого запису", async () => {
    // Порядок ключів не є частиною значення (на відміну від
    // `activeModules`), тож серверна відповідь у іншому порядку — це той
    // самий стан, а не зміна.
    getPreferences.mockResolvedValue(
      serverPrefs({ showInsights: false, calmMode: true }),
    );
    const local = makeLocal({ calmMode: true, showInsights: false });
    const write = vi.fn(local.write);

    await hydrateHubPrefs(local.read, write);

    expect(write).not.toHaveBeenCalled();
  });
});

describe("hydrateHubPrefs — гонка з перемиканням тумблера", () => {
  // Гілка, помічена в `hubPrefsSync.ts` маркером AI-DANGER (тут маркер не
  // ставимо — він належить самому коду, не тесту). Той самий баг уже
  // ловили на `activeModules`
  // (browser-QA 2026-09-02): бут почався → людина перемкнула тумблер →
  // приїхала відповідь бута зі СТАРИМ станом і відкотила перемикач на
  // очах.
  //
  // Break-test: прибери `if (prefsGeneration !== generationAtStart) return;`
  // у `hydrateHubPrefs` — падає РІВНО цей тест.
  it("не застосовує серверний стан, якщо тумблер перемкнули під час запиту", async () => {
    let resolveGet: (v: unknown) => void = () => {};
    getPreferences.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
    );
    // На старті буту і локально, і на сервері `calmMode: true`.
    const local = makeLocal({ calmMode: true });

    const inFlight = hydrateHubPrefs(local.read, local.write);

    // Людина вимикає тумблер, поки GET у польоті. `saveHubPref` робить
    // рівно це: спершу пише локально, потім шле PATCH.
    local.write({ calmMode: false });
    pushHubPrefs({ calmMode: false });

    // …і аж тепер приїжджає відповідь, сформована ДО перемикання.
    resolveGet(serverPrefs({ calmMode: true }));
    await inFlight;

    // Без гарду `writeLocal` застосував би СТАРИЙ серверний стан і тумблер
    // відкотився б назад в `true` на очах у людини. Свіже значення при
    // цьому вже поїхало своїм PATCH-ом, тож скіп нічого не втрачає.
    expect(local.current()).toEqual({ calmMode: false });
    expect(updatePreferences).toHaveBeenCalledWith({
      hubPrefs: { calmMode: false },
    });
  });
});

describe("pushHubPrefs", () => {
  it("не кидає, коли мережа впала", async () => {
    // Fire-and-forget: локальний запис уже стався, і мережева помилка не
    // має ні падати в UI, ні відкочувати тумблер — наступний бут доллє.
    updatePreferences.mockRejectedValue(new Error("offline"));
    expect(() => pushHubPrefs({ calmMode: true })).not.toThrow();
    await Promise.resolve();
  });

  it("шле копію, а не посилання на живий обʼєкт", async () => {
    // Інакше подальша мутація локального мішка змінила б payload уже
    // відправленого запиту — клас багів, який видно лише під навантаженням.
    const bag = { calmMode: true };
    pushHubPrefs(bag);
    bag.calmMode = false;
    expect(updatePreferences).toHaveBeenCalledWith({
      hubPrefs: { calmMode: true },
    });
  });
});

describe("PR-S13: вихідний канал глушиться без сесії", () => {
  // Два різні збитки від одного недогляду, і другий гірший за перший.
  it("гість не шле PATCH, приречений на 401", async () => {
    setHubPrefsSyncEnabled(false);
    pushHubPrefs({ calmMode: true });
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("локальні налаштування гостя не їдуть на акаунт раніше за гідратацію", async () => {
    // Гість накрутив налаштувань на чужому ноутбуці, потім увійшов
    // власник. Без гарду перший же перемкнутий тумблер відправив би
    // гостьовий стан на акаунт власника — ще до того, як гідратація
    // встигне спитати, що на цьому акаунті вже є.
    setHubPrefsSyncEnabled(false);
    pushHubPrefs({ calmMode: true, showInsights: false });
    expect(updatePreferences).not.toHaveBeenCalled();

    // Лічильник поколінь при цьому ВСЕ ОДНО рухається: локальна зміна
    // сталася, і гідратація, яка вже в польоті, не має її затирати.
    setHubPrefsSyncEnabled(true);
    let resolveGet: (v: unknown) => void = () => {};
    getPreferences.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        }),
    );
    const local = makeLocal({ calmMode: true });
    const inFlight = hydrateHubPrefs(local.read, local.write);
    local.write({ calmMode: false });
    pushHubPrefs({ calmMode: false });
    resolveGet(serverPrefs({ calmMode: true }));
    await inFlight;
    expect(local.current()).toEqual({ calmMode: false });
  });
});
