// @vitest-environment jsdom
import { vi } from "vitest";
/**
 * `useAnalyticsConsentBoot` — hydrates the synchronous `analyticsConsent`
 * cache from `/api/me/preferences` once per authenticated `userId`
 * (CodeRabbit PR #627). Mirrors `useProfileWriteThroughBoot.test.tsx`'s
 * boot-wiring test shape.
 */
const { mockUseAuth, mockGetPreferences, mockUpdatePreferences } = vi.hoisted(
  () => ({
    mockUseAuth: vi.fn(),
    mockGetPreferences: vi.fn(),
    mockUpdatePreferences: vi.fn(),
  }),
);
vi.mock("../auth/AuthContext", () => ({ useAuth: mockUseAuth }));
vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: mockGetPreferences,
    updatePreferences: mockUpdatePreferences,
  },
}));

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetAnalyticsConsentForTests,
  getAnalyticsConsent,
  getAnalyticsDecision,
  getPendingAnalyticsSync,
  isAnalyticsServerHydrated,
  setAnalyticsConsent,
} from "./analyticsConsent";
import { useAnalyticsConsentBoot } from "./useAnalyticsConsentBoot";

beforeEach(() => {
  mockUseAuth.mockReset();
  mockGetPreferences.mockReset();
  mockUpdatePreferences.mockReset();
  __resetAnalyticsConsentForTests();
  localStorage.clear();
});

describe("useAnalyticsConsentBoot", () => {
  it("does not fetch when signed out — cache stays deny-by-default", () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderHook(() => useAnalyticsConsentBoot());

    expect(mockGetPreferences).not.toHaveBeenCalled();
    expect(getAnalyticsConsent()).toBe(false);
  });

  it("hydrates the consent cache from the server once when authenticated", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockGetPreferences.mockResolvedValue({
      analytics: true,
      aiMemory: true,
      pushNotifications: false,
      sergeantNudges: false,
      healthDataConsent: false,
      updatedAt: null,
    });

    renderHook(() => useAnalyticsConsentBoot());

    await waitFor(() => expect(getAnalyticsConsent()).toBe(true));
    expect(mockGetPreferences).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch on a rerender with the same userId", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockGetPreferences.mockResolvedValue({
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      sergeantNudges: false,
      healthDataConsent: false,
      updatedAt: null,
    });

    const { rerender } = renderHook(() => useAnalyticsConsentBoot());
    await waitFor(() => expect(mockGetPreferences).toHaveBeenCalledTimes(1));

    rerender();
    await new Promise((r) => setTimeout(r, 0));
    expect(mockGetPreferences).toHaveBeenCalledTimes(1);
  });

  it("hydrates the server's persisted opt-out (analytics: false) instead of leaving the deny-by-default in place by coincidence", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockGetPreferences.mockResolvedValue({
      analytics: false,
      aiMemory: true,
      pushNotifications: false,
      sergeantNudges: false,
      healthDataConsent: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    // Prove hydration actually ran and didn't just leave the default in
    // place: seed a `true` value first, then let boot overwrite it.
    const { setAnalyticsConsent } = await import("./analyticsConsent");
    setAnalyticsConsent(true);

    renderHook(() => useAnalyticsConsentBoot());

    await waitFor(() => expect(getAnalyticsConsent()).toBe(false));
  });

  it("re-hydrates after sign-out then a different sign-in (shared device)", async () => {
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockGetPreferences.mockResolvedValue({
      analytics: true,
      aiMemory: true,
      pushNotifications: false,
      sergeantNudges: false,
      healthDataConsent: false,
      updatedAt: null,
    });
    const { rerender } = renderHook(() => useAnalyticsConsentBoot());
    await waitFor(() => expect(mockGetPreferences).toHaveBeenCalledTimes(1));

    mockUseAuth.mockReturnValue({ user: null });
    rerender();

    mockUseAuth.mockReturnValue({ user: { id: "user-2" } });
    rerender();

    await waitFor(() => expect(mockGetPreferences).toHaveBeenCalledTimes(2));
  });

  it("гість погодився в онбордингу → після входу вибір іде на сервер, а не перетирається дефолтом", async () => {
    setAnalyticsConsent(true, { pendingServerSync: true });
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockUpdatePreferences.mockResolvedValue({ analytics: true });
    mockGetPreferences.mockResolvedValue({ analytics: false, updatedAt: null });

    renderHook(() => useAnalyticsConsentBoot());

    await waitFor(() => expect(getPendingAnalyticsSync()).toBeNull());
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ analytics: true });
    expect(mockGetPreferences).not.toHaveBeenCalled();
    expect(getAnalyticsConsent()).toBe(true);
    expect(getAnalyticsDecision()).toBe("granted");
    expect(isAnalyticsServerHydrated()).toBe(true);
  });

  it("синк рішення гостя впав → локальний вибір діє, прапорець чекає наступного входу", async () => {
    setAnalyticsConsent(true, { pendingServerSync: true });
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    mockUpdatePreferences.mockRejectedValue(new Error("offline"));

    renderHook(() => useAnalyticsConsentBoot());

    await waitFor(() => expect(isAnalyticsServerHydrated()).toBe(true));
    expect(getPendingAnalyticsSync()).toBe("granted");
    expect(getAnalyticsConsent()).toBe(true);
    expect(mockGetPreferences).not.toHaveBeenCalled();
  });

  it("вибір, змінений поки летів синк гостя, не перетирається відповіддю сервера", async () => {
    setAnalyticsConsent(true, { pendingServerSync: true });
    mockUseAuth.mockReturnValue({ user: { id: "user-1" } });
    let resolveUpload: (v: unknown) => void = () => {};
    mockUpdatePreferences.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );

    renderHook(() => useAnalyticsConsentBoot());
    await waitFor(() => expect(mockUpdatePreferences).toHaveBeenCalled());

    // Людина вимикає аналітику в Налаштуваннях, поки запит ще в дорозі.
    setAnalyticsConsent(false);
    resolveUpload({ analytics: true });

    await waitFor(() => expect(isAnalyticsServerHydrated()).toBe(true));
    expect(getAnalyticsConsent()).toBe(false);
    expect(getAnalyticsDecision()).toBe("denied");
  });
});
