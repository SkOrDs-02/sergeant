/**
 * Render tests for `<NotificationsSection>`.
 *
 * Covers:
 *  - collapsed-by-default header with the "Сповіщення" title;
 *  - expanding reveals the push-permission status card (with the
 *    correct status label driven by `Notifications.getPermissionsAsync`)
 *    plus the three sub-group titles (Habits / Fizruk / Nutrition);
 *  - tapping "Дозволити" calls `Notifications.requestPermissionsAsync`
 *    and flips the status label;
 *  - the routine-reminders toggle persists into the shared
 *    `@routine_prefs_v1` MMKV slice;
 *  - the nutrition reminder toggle/hour picker persists into the shared
 *    nutrition prefs MMKV slice;
 *  - the Fizruk sub-group surfaces its deferred-port placeholder string.
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

jest.mock("expo-notifications", () => {
  const getPermissionsAsync = jest.fn();
  const requestPermissionsAsync = jest.fn();
  return {
    __esModule: true,
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    getPermissionsAsync,
    requestPermissionsAsync,
  };
});

jest.mock("react-native/Libraries/Linking/Linking", () => ({
  openSettings: jest.fn(() => Promise.resolve()),
}));

import * as Notifications from "expo-notifications";
import { Linking } from "react-native";

import { NotificationsSection } from "./NotificationsSection";

const mockedGetPerms = Notifications.getPermissionsAsync as jest.Mock;
const mockedRequestPerms = Notifications.requestPermissionsAsync as jest.Mock;
const mockedOpenSettings = Linking.openSettings as unknown as jest.Mock;

beforeEach(() => {
  _getMMKVInstance().clearAll();
  mockedGetPerms.mockReset();
  mockedRequestPerms.mockReset();
  mockedOpenSettings.mockClear();
  mockedGetPerms.mockResolvedValue({
    granted: false,
    status: "undetermined",
  });
});

describe("NotificationsSection", () => {
  it("renders the collapsed group header", () => {
    const { getByText, queryByText } = render(<NotificationsSection />);
    expect(getByText("Сповіщення")).toBeTruthy();
    expect(queryByText("Push-сповіщення")).toBeNull();
  });

  it("expands to reveal the permission card, toggles and deferred sub-groups", async () => {
    mockedGetPerms.mockResolvedValueOnce({
      granted: true,
      status: "granted",
    });
    const { getByText, getByTestId } = render(<NotificationsSection />);

    fireEvent.press(getByText("Сповіщення"));

    await waitFor(() => {
      expect(
        getByTestId("notifications-permission-status").props.children,
      ).toBe("Дозволено");
    });

    expect(getByText("Push-сповіщення")).toBeTruthy();
    expect(getByText("Звички (Рутина)")).toBeTruthy();
    expect(getByText("Нагадування про звички")).toBeTruthy();
    expect(getByText("Тренування (Фізрук)")).toBeTruthy();
    expect(
      getByText(
        "Нагадування про тренування підключаться з портом модуля Фізрук (Phase 6).",
      ),
    ).toBeTruthy();
    expect(getByText("Харчування")).toBeTruthy();
    expect(getByText("Нагадування про їжу")).toBeTruthy();
    expect(getByTestId("notifications-nutrition-toggle")).toBeTruthy();
  });

  it("requests permissions when 'Дозволити' is tapped and updates the label", async () => {
    mockedRequestPerms.mockResolvedValueOnce({
      granted: true,
      status: "granted",
    });
    const { getByText, getByTestId } = render(<NotificationsSection />);

    fireEvent.press(getByText("Сповіщення"));

    await waitFor(() => {
      expect(
        getByTestId("notifications-permission-status").props.children,
      ).toBe("Не встановлено");
    });

    await act(async () => {
      fireEvent.press(getByTestId("notifications-request-permission"));
    });

    expect(mockedRequestPerms).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        getByTestId("notifications-permission-status").props.children,
      ).toBe("Дозволено");
    });
  });

  it("offers an 'open settings' shortcut when permission is denied", async () => {
    mockedGetPerms.mockResolvedValueOnce({ granted: false, status: "denied" });
    const { getByText, getByTestId } = render(<NotificationsSection />);

    fireEvent.press(getByText("Сповіщення"));

    await waitFor(() => {
      expect(
        getByTestId("notifications-permission-status").props.children,
      ).toBe("Заблоковано");
    });

    fireEvent.press(getByTestId("notifications-open-settings"));
    expect(mockedOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("persists the routine-reminders toggle into @routine_prefs_v1", async () => {
    const { getByText, getByTestId } = render(<NotificationsSection />);

    fireEvent.press(getByText("Сповіщення"));

    await waitFor(() => {
      expect(getByTestId("notifications-routine-toggle")).toBeTruthy();
    });

    fireEvent(getByTestId("notifications-routine-toggle"), "valueChange", true);

    const stored = _getMMKVInstance().getString("@routine_prefs_v1");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({
      routineRemindersEnabled: true,
    });
  });

  it("persists nutrition reminder toggle and hour into nutrition prefs", async () => {
    mockedGetPerms.mockResolvedValueOnce({
      granted: true,
      status: "granted",
    });
    const { getByText, getByTestId } = render(<NotificationsSection />);

    fireEvent.press(getByText("Сповіщення"));

    await waitFor(() => {
      expect(getByTestId("notifications-nutrition-toggle")).toBeTruthy();
    });

    await act(async () => {
      fireEvent(
        getByTestId("notifications-nutrition-toggle"),
        "valueChange",
        true,
      );
    });

    await waitFor(() => {
      expect(getByTestId("notifications-nutrition-hour")).toBeTruthy();
    });

    fireEvent.changeText(getByTestId("notifications-nutrition-hour"), "25");

    const stored = _getMMKVInstance().getString(STORAGE_KEYS.NUTRITION_PREFS);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string)).toMatchObject({
      reminderEnabled: true,
      reminderHour: 23,
    });
  });
});
