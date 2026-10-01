// @vitest-environment jsdom
import { vi } from "vitest";

const { mockUseAuth, mockUpdatePreferences } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUpdatePreferences: vi.fn(),
}));
vi.mock("../auth/AuthContext", () => ({ useAuth: mockUseAuth }));
vi.mock("@shared/api", () => ({
  meApi: { updatePreferences: mockUpdatePreferences },
}));

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsDecision,
  getPendingAnalyticsSync,
  setAnalyticsConsent,
} from "./analyticsConsent";
import { useAnalyticsConsentChoice } from "./useAnalyticsConsentChoice";

beforeEach(() => {
  mockUseAuth.mockReset();
  mockUpdatePreferences.mockReset();
  localStorage.clear();
  __resetAnalyticsConsentForTests();
});

describe("useAnalyticsConsentChoice — позначка «ще не на сервері»", () => {
  it("гість: рішення чекає синку, на сервер нічого не йде", () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useAnalyticsConsentChoice());

    act(() => result.current.choose(true));

    expect(mockUpdatePreferences).not.toHaveBeenCalled();
    expect(getPendingAnalyticsSync()).toBe("granted");
  });

  it("залогінений: позначка знімається, щойно сервер підтвердив запис", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUpdatePreferences.mockResolvedValue({ analytics: true });
    const { result } = renderHook(() => useAnalyticsConsentChoice());

    act(() => result.current.choose(true));

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ analytics: true });
    await waitFor(() => expect(getPendingAnalyticsSync()).toBeNull());
    expect(getAnalyticsDecision()).toBe("granted");
  });

  it("залогінений, запис упав: рішення лишається чекати синку", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    mockUpdatePreferences.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAnalyticsConsentChoice());

    act(() => result.current.choose(false));

    await waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalled());
    await Promise.resolve();
    expect(getPendingAnalyticsSync()).toBe("denied");
  });

  it("вибір, змінений поки летів запит, не перетирається відповіддю", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" } });
    let resolveUpload: (v: unknown) => void = () => {};
    mockUpdatePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    const { result } = renderHook(() => useAnalyticsConsentChoice());

    act(() => result.current.choose(true));
    // Людина вимикає аналітику в Налаштуваннях, поки запит ще в дорозі.
    setAnalyticsConsent(false, { pendingServerSync: true });
    await act(async () => {
      resolveUpload({ analytics: true });
    });

    expect(getAnalyticsDecision()).toBe("denied");
    expect(getPendingAnalyticsSync()).toBe("denied");
  });
});
