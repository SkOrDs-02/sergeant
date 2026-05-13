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
 *    nutrition prefs via the SQLite-backed dual-write trigger (the
 *    MMKV `nutrition_prefs_v1` slice was tombstoned in Stage 8 PR #073,
 *    so the assertion targets the dual-write payload, not MMKV);
 *  - the Fizruk sub-group surfaces its deferred-port placeholder string.
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";

// `saveNutritionPrefs` writes through `triggerNutritionDualWrite` —
// the SQLite-backed sync trigger that replaced the legacy MMKV
// `nutrition_prefs_v1` writer in Stage 8 PR #073
// (`docs/planning/storage-roadmap.md`). The trigger ends in a write to
// the `nutrition_prefs` SQLite table; we mock the trigger itself so
// the assertion stays scoped to the component contract ("toggle drives
// a prefs write with the new shape") instead of booting the entire
// dual-write adapter + better-sqlite3 stack inside a render test.
const mockTriggerNutritionDualWrite = jest.fn();
const mockIsNutritionDualWriteRegistered = jest.fn(() => true);
jest.mock("@/modules/nutrition/lib/dualWrite", () => ({
  __esModule: true,
  triggerNutritionDualWrite: (...args: unknown[]) =>
    mockTriggerNutritionDualWrite(...args),
  isNutritionDualWriteRegistered: () => mockIsNutritionDualWriteRegistered(),
  // `peekNutritionDualWriteState` is consumed by `saveNutritionPrefs`
  // to build the `next` payload; returning a non-null prev unlocks the
  // early-return guard so the trigger actually fires.
  peekNutritionDualWriteState: () => ({
    log: { meals: [] },
    prefs: { prefsJson: "{}", activePantryId: null },
    pantries: [],
    waterLog: {},
    shoppingList: { items: [] },
  }),
}));

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
  mockTriggerNutritionDualWrite.mockReset();
  mockIsNutritionDualWriteRegistered.mockReset().mockReturnValue(true);
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
    expect(getByText("Рутина (звички)")).toBeTruthy();
    expect(getByText("Нагадування про звички")).toBeTruthy();
    expect(getByText("Фізрук (тренування)")).toBeTruthy();
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

  it("persists nutrition reminder toggle and hour through the dual-write trigger (no MMKV write)", async () => {
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

    // Stage 8 PR #073 tombstone: nutrition prefs no longer round-trip
    // through MMKV. The component contract is "toggle + hour drive a
    // single `triggerNutritionDualWrite` call whose `next.prefs`
    // carries the new `reminderEnabled` / `reminderHour` payload".
    expect(_getMMKVInstance().getString("nutrition_prefs_v1")).toBeFalsy();
    expect(mockTriggerNutritionDualWrite).toHaveBeenCalled();
    const lastCall =
      mockTriggerNutritionDualWrite.mock.calls[
        mockTriggerNutritionDualWrite.mock.calls.length - 1
      ];
    expect(lastCall).toBeDefined();
    const next = lastCall![1] as {
      prefs: { prefsJson: string; activePantryId: string | null };
    };
    const parsed = JSON.parse(next.prefs.prefsJson) as {
      reminderEnabled: boolean;
      reminderHour: number;
    };
    expect(parsed.reminderEnabled).toBe(true);
    // Component clamps the entered "25" down to the 0–23 range.
    expect(parsed.reminderHour).toBe(23);
  });
});
