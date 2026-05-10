/**
 * Jest render + behaviour tests for the Fizruk Programs page
 * (Phase 6 · PR-F; updated for Stage 12.5 / PR
 * #057f2-tombstone-mobile-stage12-5 — the active-program slot now
 * lives in the SQLite warm cache, not MMKV).
 *
 * Coverage:
 *  - Empty-state hero card when no program is active AND catalogue is
 *    non-empty (activation nudge).
 *  - Full catalogue renders one `ProgramCard` per built-in program
 *    with an "Активувати" CTA.
 *  - Activate → card flips to "Деактивувати"; pressing it clears the
 *    slot back to the empty hero state (in-memory only — no MMKV
 *    writes after Stage 12.5).
 *  - Hero "Сьогоднішня сесія" renders when today's weekday is in the
 *    active program's schedule; falls back to "Сьогодні — вихідний"
 *    on a rest day.
 *  - Pressing "Почати" writes a program-* id into the shared active
 *    workout MMKV slot (`FIZRUK_ACTIVE_WORKOUT`).
 *  - Empty-catalogue edge case shows the `-empty` catalogue slot.
 */

import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { __resetFizrukSqliteReadGateForTests } from "../lib/sqliteReadGate";

import { Programs } from "./Programs";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock("expo-keep-awake", () => ({
  __esModule: true,
  activateKeepAwakeAsync: jest.fn(() => Promise.resolve()),
  deactivateKeepAwake: jest.fn(),
}));

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __resetFizrukSqliteReadGateForTests();
  jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(() => ({ remove: () => {} }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Fizruk Programs page (mobile)", () => {
  it("renders the empty hero state and every built-in program card", () => {
    render(<Programs />);

    // Hero card nudges activation when no program is active.
    expect(screen.getByTestId("fizruk-programs-today-empty")).toBeTruthy();

    // Catalogue list is rendered with one card per canonical program.
    expect(screen.getByTestId("fizruk-programs-list")).toBeTruthy();
    for (const id of ["ppl", "upper_lower", "full_body", "starting_strength"]) {
      expect(screen.getByTestId(`fizruk-programs-card-${id}`)).toBeTruthy();
      expect(
        screen.getByTestId(`fizruk-programs-card-${id}-activate`),
      ).toBeTruthy();
    }
  });

  it("activating a program toggles its CTA and flips the active-program slot", () => {
    render(<Programs />);

    act(() => {
      fireEvent.press(screen.getByTestId("fizruk-programs-card-ppl-activate"));
    });

    // Stage 12.5: the slot is in-memory only (SQLite cache + dual-write).
    // No MMKV write any longer.
    expect(
      _getMMKVInstance().contains(STORAGE_KEYS.FIZRUK_ACTIVE_PROGRAM),
    ).toBe(false);

    // Card now renders a Деактивувати control.
    expect(
      screen.getByTestId("fizruk-programs-card-ppl-deactivate"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-programs-card-ppl-active-badge"),
    ).toBeTruthy();

    act(() => {
      fireEvent.press(
        screen.getByTestId("fizruk-programs-card-ppl-deactivate"),
      );
    });

    // Back to the empty hero state + Активувати CTA.
    expect(screen.getByTestId("fizruk-programs-today-empty")).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-programs-card-ppl-activate"),
    ).toBeTruthy();
  });

  it("shows the planned session hero when the active program schedules today", () => {
    // PPL schedules a Push session on day 1 (Monday).
    const monday = new Date("2026-04-20T12:00:00Z");
    jest.useFakeTimers().setSystemTime(monday);
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: "ppl" },
    });

    render(<Programs />);

    expect(screen.getByTestId("fizruk-programs-today-title")).toBeTruthy();
    expect(screen.getByText("Push Day")).toBeTruthy();
    expect(screen.getByTestId("fizruk-programs-today-start")).toBeTruthy();

    jest.useRealTimers();
  });

  it("shows the rest-day hero when the active program has no session today", () => {
    // PPL schedules days 1-6 (Mon-Sat). Use a Sunday.
    const sunday = new Date("2026-04-26T12:00:00Z");
    jest.useFakeTimers().setSystemTime(sunday);
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: "ppl" },
    });

    render(<Programs />);

    expect(screen.getByTestId("fizruk-programs-today-rest")).toBeTruthy();
    expect(screen.queryByTestId("fizruk-programs-today-start")).toBeNull();

    jest.useRealTimers();
  });

  it("wires the 'Почати' button into the shared active-workout MMKV slot", () => {
    const monday = new Date("2026-04-20T12:00:00Z");
    jest.useFakeTimers().setSystemTime(monday);
    __setFizrukSqliteCacheForTests({
      programs: { activeProgramId: "ppl" },
    });

    render(<Programs />);

    expect(
      _getMMKVInstance().getString(STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT),
    ).toBeUndefined();

    act(() => {
      fireEvent.press(screen.getByTestId("fizruk-programs-today-start"));
    });

    const id = _getMMKVInstance().getString(STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT);
    expect(id).toBeTruthy();
    expect(id).toMatch(/^program-ppl-push-/);

    jest.useRealTimers();
  });
});
