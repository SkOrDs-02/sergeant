// @vitest-environment jsdom
/**
 * L-14: гонка GET/PUT у `useServerPreference`.
 *
 * `useServerPreference` запускає початковий `meApi.getPreferences()` у
 * `useEffect` на монтуванні. Якщо юзер клацає тумблер (`set()` → PUT)
 * ДО того, як цей GET встиг відповісти, і GET прилітає ПІЗНІШЕ за PUT —
 * стара реалізація безумовно застосовувала GET-відповідь
 * (`setValue(prefs[key] === true)`), тим самим тираючи щойно збережене
 * PUT-значення. Тумблер виглядав так, ніби клік нічого не зробив.
 *
 * Тест явно контролює порядок resolve: PUT (set) резолвиться ПЕРШИМ,
 * а повільний початковий GET — ДРУГИМ, зі СТАРИМ (протилежним)
 * серверним значенням. Без фіксу `result.current.value` після GET
 * відкотиться назад до `false`.
 *
 * F3 (review адверсаріалу L-14 фіксу): протилежний бік тієї самої
 * гонки — GET резолвиться після того, як ПОЧАВСЯ (і зрештою ВПАВ) PUT.
 * Стара реалізація гейта (`requestId !== requestIdRef.current`)
 * дискваліфікувала GET уже в момент СТАРТУ PUT, незалежно від його
 * результату — тож коли PUT падав мережевою помилкою і відкочував
 * тумблер до `previous`, єдина реальна підказка про стан сервера (GET,
 * що прийшов пізніше) губилась назавжди: `loaded` лишався `false`, а
 * `value` — неправильним, і жодна майбутня подія це не виправляла
 * (deps ефекту — константи).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { UserPreferences } from "@shared/api";

const getPreferencesMock = vi.fn<() => Promise<UserPreferences>>();
const updatePreferencesMock =
  vi.fn<(patch: Partial<UserPreferences>) => Promise<UserPreferences>>();

vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: () => getPreferencesMock(),
    updatePreferences: (patch: Partial<UserPreferences>) =>
      updatePreferencesMock(patch),
  },
}));

import { useServerPreference } from "./useServerPreference";

const BASE_PREFS: UserPreferences = {
  analytics: false,
  aiMemory: false,
  pushNotifications: false,
  sergeantNudges: false,
  healthDataConsent: false,
  activeModules: null,
  updatedAt: null,
};

describe("useServerPreference — L-14 GET/PUT race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not let a slower initial GET overwrite a faster set()/PUT result", async () => {
    let resolveGet!: (prefs: UserPreferences) => void;
    const getPromise = new Promise<UserPreferences>((resolve) => {
      resolveGet = resolve;
    });
    getPreferencesMock.mockReturnValue(getPromise);
    updatePreferencesMock.mockResolvedValue({
      ...BASE_PREFS,
      sergeantNudges: true,
    });

    const { result } = renderHook(() =>
      useServerPreference("sergeantNudges", {
        saveError: "Не вдалося зберегти",
        authRequired: "Потрібен вхід",
      }),
    );

    // Юзер клацає тумблер ще ДО того, як початковий GET відповів.
    await act(async () => {
      await result.current.set(true);
    });
    expect(result.current.value).toBe(true);

    // Тепер повільний GET нарешті відповідає — застарілим значенням
    // сервера (яке PUT щойно змінив). Ця відповідь НЕ повинна відкотити
    // тумблер назад.
    await act(async () => {
      resolveGet({ ...BASE_PREFS, sergeantNudges: false });
      await getPromise;
    });

    await waitFor(() => expect(getPreferencesMock).toHaveBeenCalledTimes(1));
    expect(result.current.value).toBe(true);
  });

  // F3: an EARLIER-issued GET that resolves AFTER a LATER-issued set()/PUT
  // has already failed must still apply — a failed PUT never told us
  // anything new about the server, so the GET remains the only real
  // confirmation we have.
  it("still applies a slow initial GET after an earlier-issued set()/PUT already failed and reverted optimistically", async () => {
    let resolveGet!: (prefs: UserPreferences) => void;
    const getPromise = new Promise<UserPreferences>((resolve) => {
      resolveGet = resolve;
    });
    getPreferencesMock.mockReturnValue(getPromise);
    updatePreferencesMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() =>
      useServerPreference("sergeantNudges", {
        saveError: "Не вдалося зберегти",
        authRequired: "Потрібен вхід",
      }),
    );

    // Клік ДО того, як початковий GET відповів — PUT падає мережевою
    // помилкою і відкочує тумблер до дефолтного `false`.
    await act(async () => {
      await result.current.set(true);
    });
    expect(result.current.value).toBe(false);
    expect(result.current.error).toBe("Не вдалося зберегти");

    // Тепер повільний GET нарешті відповідає СЕРВЕРНОЮ ПРАВДОЮ — це
    // ЄДИНЕ реальне підтвердження стану сервера, яке в нас є. Стара
    // реалізація відкидала цю відповідь назавжди (бо PUT уже "стартував"),
    // лишаючи тумблер і `loaded=false` навічно неправильними.
    await act(async () => {
      resolveGet({ ...BASE_PREFS, sergeantNudges: true });
      await getPromise;
    });

    expect(result.current.value).toBe(true);
    expect(result.current.loaded).toBe(true);
  });

  // F3 (saving-latch corner case): a `set()` call must not leave `saving`
  // stuck forever just because the effect re-issued its GET (deps change)
  // while the PUT was still in flight — the old `requestId === current`
  // check only cleared `saving` if THIS call happened to still be the
  // most-recently-ISSUED request when it settled, which an unrelated
  // effect re-run could silently break.
  it("clears `saving` once its own set()/PUT settles, even if the effect re-ran (deps change) and re-issued a GET while it was in flight", async () => {
    getPreferencesMock.mockResolvedValue(BASE_PREFS);
    let resolveUpdate!: (prefs: UserPreferences) => void;
    const updatePromise = new Promise<UserPreferences>((resolve) => {
      resolveUpdate = resolve;
    });
    updatePreferencesMock.mockReturnValue(updatePromise);

    const { result, rerender } = renderHook(
      (props: { authRequired: string }) =>
        useServerPreference("sergeantNudges", {
          saveError: "Не вдалося зберегти",
          authRequired: props.authRequired,
        }),
      { initialProps: { authRequired: "Потрібен вхід" } },
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      void result.current.set(true);
    });
    expect(result.current.saving).toBe(true);

    // Deps change while the PUT above is still in flight — this re-runs
    // the effect and issues a SECOND GET, bumping `requestIdRef` for a
    // reason that has nothing to do with the pending PUT.
    rerender({ authRequired: "Потрібен новий вхід" });
    await waitFor(() => expect(getPreferencesMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveUpdate({ ...BASE_PREFS, sergeantNudges: true });
      await updatePromise;
    });

    expect(result.current.saving).toBe(false);
  });
});
