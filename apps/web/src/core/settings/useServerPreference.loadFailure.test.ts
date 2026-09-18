// @vitest-environment jsdom
/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * PR-S2, інтеграційна половина. `preferenceLoadFailure.test.ts` пінує саму
 * класифікацію; тут перевіряється, що хук її ВЖИВАЄ — бо класифікатор, який
 * ніхто не кличе, зелений так само, як і той, що працює.
 *
 * Break-test (обовʼязковий за `sergeant-bugfix-and-regression`), прогнано:
 * зі старим тілом `.catch(() => { setError(copy.authRequired); })` падають
 * РІВНО перші два тести (2 failed | 2 passed) — саме вони і є знахідкою.
 * Третій (401) і четвертий (`loaded === false`) на старому коді проходять, і
 * лишаються свідомо: вони стережуть, щоб виправлення не забрало правильну
 * поведінку разом із неправильною. Тобто це піни на інваріант, а не докази
 * дефекту, і читати їх як докази не треба.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { ApiError } from "@sergeant/api-client";
import type { UserPreferences } from "@shared/api";

const getPreferencesMock = vi.fn<() => Promise<UserPreferences>>();

vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: () => getPreferencesMock(),
    updatePreferences: vi.fn(),
  },
}));

const { useServerPreference } = await import("./useServerPreference");
const { PREFERENCE_LOAD_FAILURE_COPY } =
  await import("./preferenceLoadFailure");

const COPY = {
  saveError: "Не вдалося зберегти налаштування. Спробуй ще раз.",
  authRequired: "Увійди в акаунт, щоб Сержант знав, кому і коли писати.",
};

const mount = () =>
  renderHook(() => useServerPreference("sergeantNudges", COPY));

beforeEach(() => {
  getPreferencesMock.mockReset();
});

describe("useServerPreference — причина, з якої не завантажилось", () => {
  it("не каже залогіненому «увійди», коли зник звʼязок", async () => {
    getPreferencesMock.mockRejectedValue(
      new ApiError({
        kind: "network",
        message: "Failed to fetch",
        url: "/api/me/preferences",
      }),
    );

    const { result } = mount();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe(PREFERENCE_LOAD_FAILURE_COPY.offline);
    expect(result.current.error).not.toBe(COPY.authRequired);
  });

  it("не каже «увійди» на 500", async () => {
    getPreferencesMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 500,
        message: "Internal Server Error",
        url: "/api/me/preferences",
      }),
    );

    const { result } = mount();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe(PREFERENCE_LOAD_FAILURE_COPY.failure);
  });

  it("а на 401 каже саме «увійди» — правильну поведінку не забрали", async () => {
    getPreferencesMock.mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 401,
        message: "Unauthorized",
        url: "/api/me/preferences",
      }),
    );

    const { result } = mount();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe(COPY.authRequired);
  });

  it("у кожному разі лишає тумблер незавантаженим", async () => {
    getPreferencesMock.mockRejectedValue(
      new ApiError({
        kind: "network",
        message: "Failed to fetch",
        url: "/api/me/preferences",
      }),
    );

    const { result } = mount();

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loaded).toBe(false);
  });
});
