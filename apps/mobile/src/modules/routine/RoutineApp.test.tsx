/**
 * Render tests for the Routine module shell (Phase 5 PR 1).
 *
 * Covers:
 *  - Default tab is "Календар" (web parity — web defaults to "calendar");
 *  - Tapping bottom-nav switches between the 3 placeholder screens;
 *  - Active tab is written to MMKV under STORAGE_KEYS.ROUTINE_MAIN_TAB
 *    (web parity — persisted tab survives the app lifecycle);
 *  - An existing persisted tab is picked up on first mount;
 *  - Legacy / malformed persisted value falls back to "calendar" without
 *    crashing the shell.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";
import { ToastProvider } from "@/components/ui/Toast";

import { RoutineApp } from "./RoutineApp";

function renderApp() {
  return render(
    <ToastProvider>
      <RoutineApp />
    </ToastProvider>,
  );
}

// Unique copy inside the mounted Calendar screen (the bottom-nav item
// label is just "Календар", so we pin to the eyebrow kicker inside
// `pages/Calendar.tsx` which only exists when that page is mounted).
const CALENDAR_EYEBROW = "Hub календар";
// The Stats tab now hosts the live `HeatmapPage` (Phase 5 — Heatmap
// PR) instead of the placeholder card. Anchor the render check on
// the unique headline copy inside that page.
const STATS_HEADLINE = "Хітмеп";
// The Settings tab hosts the live `HabitsPage` (Phase 5 PR 3) instead
// of the placeholder card; the unique headline copy inside that page
// anchors the render check.
const SETTINGS_HEADLINE = "Звички";

beforeEach(() => {
  _getMMKVInstance().clearAll();
});

describe("RoutineApp shell", () => {
  it("renders the Calendar screen by default", () => {
    const { getByText } = renderApp();
    expect(getByText(CALENDAR_EYEBROW)).toBeTruthy();
  });

  it("switches to the Heatmap page when the Stats tab is pressed", () => {
    const { getAllByText, getByText, queryByText } = renderApp();

    fireEvent.press(getAllByText("Статистика")[0]);

    expect(getByText(STATS_HEADLINE)).toBeTruthy();
    // Calendar screen body is no longer mounted.
    expect(queryByText(CALENDAR_EYEBROW)).toBeNull();
  });

  it("switches to the Habits page when the Settings tab is pressed", () => {
    const { getAllByText, getByText } = renderApp();

    fireEvent.press(getAllByText("Налаштування")[0]);

    // `HabitsPage` renders its own «Звички» headline with the ⚙️ emoji.
    expect(getByText(SETTINGS_HEADLINE)).toBeTruthy();
  });

  it("writes the selected tab to MMKV under the shared ROUTINE_MAIN_TAB key", () => {
    const { getAllByText } = renderApp();

    fireEvent.press(getAllByText("Статистика")[0]);

    // We persist the tab as a raw string (web parity — web calls
    // localStorage.setItem(key, "stats") with no JSON wrapper).
    const raw = _getMMKVInstance().getString(STORAGE_KEYS.ROUTINE_MAIN_TAB);
    expect(raw).toBe("stats");
  });

  it("picks up a persisted tab from MMKV on first mount", () => {
    _getMMKVInstance().set(STORAGE_KEYS.ROUTINE_MAIN_TAB, "settings");

    const { getByText } = renderApp();

    expect(getByText(SETTINGS_HEADLINE)).toBeTruthy();
  });

  it("falls back to the Calendar tab when the persisted value is malformed", () => {
    _getMMKVInstance().set(STORAGE_KEYS.ROUTINE_MAIN_TAB, "not-a-valid-tab");

    const { getByText } = renderApp();

    expect(getByText(CALENDAR_EYEBROW)).toBeTruthy();
  });
});
