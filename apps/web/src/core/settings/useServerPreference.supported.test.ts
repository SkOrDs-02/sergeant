// @vitest-environment jsdom
/**
 * `supported` у `useServerPreference` (спека
 * notifications-quiet-hours-and-device-time, § Викочування: один PR).
 *
 * Новий веб їде на Vercel раніше, ніж бекенд з міграцією 168. Старий сервер
 * не віддає нових полів і відхиляє патч із ними `400` (`.strict()`), тож хук
 * мусить розпізнати старий сервер за відповіддю читання і не ходити в
 * мережу з `set`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
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

/** Відповідь сервера до міграції 168: нових ключів немає зовсім. */
const OLD_SERVER: UserPreferences = {
  analytics: false,
  aiMemory: false,
  pushNotifications: false,
  sergeantNudges: false,
  pushDailyCap: 2,
  healthDataConsent: false,
  activeModules: null,
  hubPrefs: null,
  updatedAt: null,
};

const NEW_SERVER: UserPreferences = {
  ...OLD_SERVER,
  timeZone: null,
  quietHoursEnabled: true,
  quietHoursStartMin: 1320,
  quietHoursEndMin: 480,
  pushMonoTransactions: true,
};

const COPY = { saveError: "save", authRequired: "auth" };

describe("useServerPreference — supported", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("відповідь без поля: supported === false, set не робить запиту", async () => {
    getPreferencesMock.mockResolvedValue(OLD_SERVER);
    const { result } = renderHook(() =>
      useServerPreference("pushMonoTransactions", COPY, true),
    );

    await waitFor(() => expect(result.current.supported).toBe(false));
    expect(result.current.value).toBe(true);

    await act(async () => {
      await result.current.set(false);
    });
    expect(updatePreferencesMock).not.toHaveBeenCalled();
    expect(result.current.value).toBe(true);
  });

  it("відповідь з полем: supported === true, значення з сервера, set пише", async () => {
    getPreferencesMock.mockResolvedValue({
      ...NEW_SERVER,
      pushMonoTransactions: false,
    });
    updatePreferencesMock.mockResolvedValue({
      ...NEW_SERVER,
      pushMonoTransactions: true,
    });
    const { result } = renderHook(() =>
      useServerPreference("pushMonoTransactions", COPY, true),
    );

    await waitFor(() => expect(result.current.supported).toBe(true));
    expect(result.current.value).toBe(false);

    await act(async () => {
      await result.current.set(true);
    });
    expect(updatePreferencesMock).toHaveBeenCalledWith({
      pushMonoTransactions: true,
    });
    expect(result.current.value).toBe(true);
  });

  it("до відповіді сервера supported === null", () => {
    getPreferencesMock.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useServerPreference("quietHoursStartMin", COPY, 1320),
    );
    expect(result.current.supported).toBeNull();
    expect(result.current.value).toBe(1320);
  });

  it("поля з дефолтом схеми (стеля) лишаються supported на старому сервері", async () => {
    getPreferencesMock.mockResolvedValue(OLD_SERVER);
    const { result } = renderHook(() =>
      useServerPreference("pushDailyCap", COPY, 2),
    );
    await waitFor(() => expect(result.current.supported).toBe(true));
  });
});
