/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Пін на ПОРЯДОК у boot-хуці. Логіка злиття тестується в
 * `hubPrefsSync.test.ts`; тут — рівно те, що з неї не видно: коли саме
 * вмикається вихідний канал.
 *
 * Чому окремий файл і чому взагалі. Перша версія хука вмикала канал
 * ПЕРЕД гідратацією, і це лишало вікно рівно на час бутового GET-а:
 * тумблер, перемкнутий у ньому, відправляв повний локальний мішок —
 * можливо, гостьовий або від попереднього акаунта. Тобто гейт, поставлений
 * саме проти цього сценарію, мав дірку розміром в один мережевий запит, і
 * жоден тест логіки злиття її не бачив. Знахідка рев'ю CodeRabbit на
 * #1195.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const hydrateHubPrefs = vi.fn();
const setHubPrefsSyncEnabled = vi.fn();
let authUser: { id: string } | null = { id: "user-a" };

vi.mock("./hubPrefsSync", () => ({
  hydrateHubPrefs: (...args: unknown[]) => hydrateHubPrefs(...args),
  setHubPrefsSyncEnabled: (v: boolean) => setHubPrefsSyncEnabled(v),
}));
vi.mock("./hubPrefs", () => ({
  readHubPrefsBag: () => ({}),
  writeHubPrefsBag: () => {},
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));

const { useHubPrefsSync } = await import("./useHubPrefsSync");

function Probe() {
  useHubPrefsSync();
  return null;
}

beforeEach(() => {
  authUser = { id: "user-a" };
  hydrateHubPrefs.mockReset();
  setHubPrefsSyncEnabled.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("useHubPrefsSync — порядок увімкнення каналу", () => {
  it("НЕ вмикає канал, поки гідратація не завершилась", async () => {
    let finish: () => void = () => {};
    hydrateHubPrefs.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = () => resolve();
        }),
    );

    render(<Probe />);

    await waitFor(() => expect(hydrateHubPrefs).toHaveBeenCalled());
    // Найважливіший рядок файлу: у вікні GET-а канал мусить бути закритий.
    expect(setHubPrefsSyncEnabled).not.toHaveBeenCalledWith(true);

    finish();
    await waitFor(() =>
      expect(setHubPrefsSyncEnabled).toHaveBeenCalledWith(true),
    );
  });

  it("не вмикає канал, коли гідратація впала", async () => {
    // Ми не знаємо, що на акаунті, тож піднімати туди локальний мішок
    // наосліп означало б ризикувати затерти налаштування з іншого
    // пристрою.
    hydrateHubPrefs.mockRejectedValue(new Error("offline"));

    render(<Probe />);

    await waitFor(() => expect(hydrateHubPrefs).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(setHubPrefsSyncEnabled).not.toHaveBeenCalledWith(true);
  });

  it("гість: канал вимкнено і гідратації немає", async () => {
    authUser = null;
    render(<Probe />);
    await new Promise((r) => setTimeout(r, 0));
    expect(hydrateHubPrefs).not.toHaveBeenCalled();
    expect(setHubPrefsSyncEnabled).toHaveBeenCalledWith(false);
  });

  it("передає предикат актуальності сесії", async () => {
    // Третя знахідка того ж рев'ю: без нього відповідь користувача A
    // могла б записатись у сховище вже під сесією B.
    hydrateHubPrefs.mockResolvedValue(undefined);
    render(<Probe />);
    await waitFor(() => expect(hydrateHubPrefs).toHaveBeenCalled());

    const third = hydrateHubPrefs.mock.calls[0]?.[2];
    expect(typeof third).toBe("function");
    expect((third as () => boolean)()).toBe(true);
  });
});

describe("useHubPrefsSync — повтор після невдалої гідратації", () => {
  // Знахідка рев'ю, і вона спростувала МОЄ ВЛАСНЕ твердження на PR: я
  // написав, що «наступний ререндер спробує ще раз». Це було невірно —
  // запис у ref не викликає ререндера, а залежності ефекту були
  // `[userId]`, тож без зміни акаунта ефект більше не запускався взагалі.
  // Один невдалий GET вимикав би синхронізацію до кінця сесії, і мовчки.
  // AI-NOTE: обидва тести нижче навмисно НЕ використовують `vi.waitFor`.
  // Він опитує умову по РЕАЛЬНОМУ годиннику, поки таймери підмінені, тож
  // його бюджет (1 с) залежить від завантаження машини: в ізоляції
  // проходив, у повному прогоні падав з «expected 2, got 1» — тобто тест
  // міряв швидкість раннера, а не поведінку хука. `act(async () => …)`
  // флашить мікрозадачі й ефекти детерміновано, без жодної реальної
  // затримки.
  it("повторює спробу після помилки", async () => {
    vi.useFakeTimers();
    try {
      hydrateHubPrefs.mockRejectedValue(new Error("offline"));
      render(<Probe />);

      // `.catch()` — мікрозадача, тож без цього флашу таймер ретраю ще
      // навіть не поставлено, і крутити його не було б чого.
      await act(async () => {});
      expect(hydrateHubPrefs).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_500);
      });
      expect(hydrateHubPrefs).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("здається після вичерпання спроб, а не ретраїть вічно", async () => {
    // Нескінченний ретрай по мережі, якої може не бути, палив би батарею.
    // Незбережені локальні зміни й так переживають перезавантаження через
    // мітку `HUB_PREFS_UNSYNCED` — тож стеля тут безпечна.
    vi.useFakeTimers();
    try {
      hydrateHubPrefs.mockRejectedValue(new Error("offline"));
      render(<Probe />);

      await act(async () => {});
      expect(hydrateHubPrefs).toHaveBeenCalledTimes(1);

      // Кожна пауза — окремий `act`, і це не косметика. Таймер НАСТУПНОЇ
      // спроби ставиться в мікрозадачі `.catch()` уже після того, як React
      // прогнав ефект, тобто за межами поточного проходу
      // `advanceTimersByTimeAsync`. Один виклик на 120 с дає лише два
      // hydrate замість чотирьох — заміряно.
      for (const delay of [2_000, 8_000, 30_000]) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(delay);
        });
      }
      // 1 початкова + 3 повтори.
      expect(hydrateHubPrefs).toHaveBeenCalledTimes(4);

      // І це стеля: скільки далі не крути, четвертого повтору немає.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(hydrateHubPrefs).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
