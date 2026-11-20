/** @vitest-environment jsdom */
/**
 * `useDeviceTimeZoneSync` (спека notifications-quiet-hours-and-device-time):
 * сервер рахує нагадування в поясі пристрою, тож клієнт надсилає
 * `Intl…timeZone`, коли той відрізняється від збереженого. Старий сервер
 * (відповідь без ключа `timeZone`) патча не отримує: він відхилив би
 * невідоме поле `400`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const getPreferences = vi.fn();
const updatePreferences = vi.fn();
let authUser: { id: string } | null = { id: "user-a" };

vi.mock("@shared/api", () => ({
  meApi: {
    getPreferences: () => getPreferences(),
    updatePreferences: (patch: unknown) => updatePreferences(patch),
  },
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}));

const { useDeviceTimeZoneSync } = await import("./useDeviceTimeZoneSync");

function Probe() {
  useDeviceTimeZoneSync();
  return null;
}

const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const BASE = {
  analytics: false,
  aiMemory: true,
  pushNotifications: false,
  sergeantNudges: false,
  pushDailyCap: 2,
  healthDataConsent: false,
  activeModules: null,
  hubPrefs: null,
  updatedAt: null,
};

beforeEach(() => {
  authUser = { id: "user-a" };
  getPreferences.mockReset();
  updatePreferences.mockReset();
  updatePreferences.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("useDeviceTimeZoneSync", () => {
  it("відповідь без timeZone (старий сервер): без патча", async () => {
    getPreferences.mockResolvedValue(BASE);
    render(<Probe />);
    await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("timeZone: null (новий сервер, пояс невідомий): патч з поясом пристрою", async () => {
    getPreferences.mockResolvedValue({ ...BASE, timeZone: null });
    render(<Probe />);
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ timeZone: DEVICE_TZ }),
    );
    expect(updatePreferences).toHaveBeenCalledTimes(1);
  });

  it("той самий пояс: без патча", async () => {
    getPreferences.mockResolvedValue({ ...BASE, timeZone: DEVICE_TZ });
    render(<Probe />);
    await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("інший збережений пояс: патч лише поясом", async () => {
    getPreferences.mockResolvedValue({
      ...BASE,
      timeZone: DEVICE_TZ === "Asia/Tokyo" ? "Europe/Kyiv" : "Asia/Tokyo",
    });
    render(<Probe />);
    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({ timeZone: DEVICE_TZ }),
    );
  });

  it("гість: ні читання, ні патча", async () => {
    authUser = null;
    render(<Probe />);
    await act(async () => {});
    expect(getPreferences).not.toHaveBeenCalled();
  });

  it("повертання на вкладку перечитує налаштування", async () => {
    getPreferences.mockResolvedValue(BASE);
    render(<Probe />);
    await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(1));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(2));
  });

  it("збій мережі не кидає назовні", async () => {
    getPreferences.mockRejectedValue(new Error("offline"));
    render(<Probe />);
    await waitFor(() => expect(getPreferences).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(updatePreferences).not.toHaveBeenCalled();
  });
});
