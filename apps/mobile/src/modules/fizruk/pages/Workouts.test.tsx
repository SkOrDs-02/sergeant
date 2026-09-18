/**
 * Jest render + behaviour tests for the Fizruk Workouts page.
 *
 * Coverage:
 *  - Home view renders the active-workout hero, catalog quick-link,
 *    and the empty recent-workouts placeholder.
 *  - Pressing "Почати тренування" starts an active workout and routes
 *    to the catalog subview (elapsed timer visible in the hero).
 *  - Tapping "Всі →" from home opens the full journal subview.
 *  - Tapping a catalogue exercise adds it to the active workout.
 *  - Opening the set editor, filling in weight+reps and saving appends
 *    a set to the active item and persists it to MMKV.
 */

import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance } from "@/lib/storage";

import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
} from "../lib/sqliteReader";
import { Workouts } from "./Workouts";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

beforeEach(() => {
  _getMMKVInstance().clearAll();
  // Stage 8 PR #057f-tombstone: hooks read workouts from the SQLite
  // warm cache, not MMKV. Reset the cache between tests.
  clearFizrukSqliteCache();
  __setFizrukSqliteCacheForTests({ workouts: [] });
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

describe("Fizruk Workouts page (mobile)", () => {
  it("renders the home view with start CTA and catalog tile by default", () => {
    render(<Workouts />);

    expect(screen.getByText("Тренування")).toBeTruthy();
    expect(screen.getByTestId("fizruk-workouts-active")).toBeTruthy();
    expect(screen.getByTestId("fizruk-workouts-active-start")).toBeTruthy();
    expect(screen.getByTestId("fizruk-workouts-open-catalog")).toBeTruthy();
    // Recent-workouts empty-state hint is visible on first load.
    expect(screen.getByTestId("fizruk-workouts-recent")).toBeTruthy();
  });

  it("starts a new workout when the primary CTA is pressed and jumps to the catalog", () => {
    render(<Workouts />);

    fireEvent.press(screen.getByTestId("fizruk-workouts-active-start"));

    // Elapsed timer takes over the panel.
    expect(screen.getByTestId("fizruk-workouts-active-elapsed")).toBeTruthy();
    expect(screen.getByTestId("fizruk-workouts-active-finish")).toBeTruthy();
    // The catalog subview is now active (search input visible).
    expect(screen.getByTestId("fizruk-workouts-catalog-search")).toBeTruthy();

    // FIZRUK_ACTIVE_WORKOUT is a separate MMKV-backed pointer to
    // the in-flight workout id; not part of #057f-tombstone scope.
    const rawActive = _getMMKVInstance().getString(
      STORAGE_KEYS.FIZRUK_ACTIVE_WORKOUT,
    );
    expect(rawActive).toBeTruthy();
    // Stage 8 PR #057f-tombstone: workouts persistence is now SQLite-
    // only via `triggerFizrukDualWrite`. The hook surface still
    // reflects the new workout in React state, so verify via UI
    // (active hero is on-screen with elapsed timer) instead of MMKV.
    expect(screen.getByTestId("fizruk-workouts-active-elapsed")).toBeTruthy();
  });

  it("opens the journal subview from the 'Всі →' shortcut", () => {
    // Stage 8 PR #057f-tombstone: seed the SQLite cache instead of MMKV.
    __setFizrukSqliteCacheForTests({
      workouts: [
        {
          id: "w_older",
          startedAt: "2026-04-10T12:00:00Z",
          endedAt: "2026-04-10T13:00:00Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
        {
          id: "w_newer",
          startedAt: "2026-04-20T18:00:00Z",
          endedAt: "2026-04-20T19:00:00Z",
          items: [],
          groups: [],
          warmup: null,
          cooldown: null,
          note: "",
        },
      ],
    });

    render(<Workouts />);

    fireEvent.press(screen.getByTestId("fizruk-workouts-open-journal"));

    expect(
      screen.getByTestId("fizruk-workouts-journal-row-w_older"),
    ).toBeTruthy();
    expect(
      screen.getByTestId("fizruk-workouts-journal-row-w_newer"),
    ).toBeTruthy();
  });

  it("adds the tapped catalogue exercise to the active workout", () => {
    render(<Workouts />);

    fireEvent.press(screen.getByTestId("fizruk-workouts-active-start"));

    // Home → catalog jump happens automatically via handleStart.
    fireEvent.changeText(
      screen.getByTestId("fizruk-workouts-catalog-search"),
      "Жим штанги лежачи",
    );

    const rows = screen.getAllByTestId(/^fizruk-workouts-catalog-row-/);
    expect(rows.length).toBeGreaterThan(0);

    act(() => {
      fireEvent.press(rows[0]!);
    });

    // Stage 8 PR #057f-tombstone: verify via UI rather than MMKV.
    // The active-item card with an `-add-set` button is rendered
    // when an exercise is appended to the active workout.
    fireEvent.press(screen.getByTestId("fizruk-workouts-back"));
    const addSetButtons = screen.getAllByTestId(/-add-set$/);
    expect(addSetButtons.length).toBeGreaterThan(0);
  });

  it("appends a set via the active-set editor", () => {
    render(<Workouts />);

    fireEvent.press(screen.getByTestId("fizruk-workouts-active-start"));

    fireEvent.changeText(
      screen.getByTestId("fizruk-workouts-catalog-search"),
      "Жим штанги лежачи",
    );

    const rows = screen.getAllByTestId(/^fizruk-workouts-catalog-row-/);
    act(() => {
      fireEvent.press(rows[0]!);
    });

    // Navigate back to home to access the active-item cards (they
    // live alongside the hero, not inside the catalog subview).
    fireEvent.press(screen.getByTestId("fizruk-workouts-back"));

    const addSetButtons = screen.getAllByTestId(/-add-set$/);
    expect(addSetButtons.length).toBeGreaterThan(0);
    act(() => {
      fireEvent.press(addSetButtons[0]!);
    });

    fireEvent.changeText(
      screen.getByTestId("fizruk-workouts-set-editor-weight-input"),
      "60",
    );
    fireEvent.changeText(
      screen.getByTestId("fizruk-workouts-set-editor-reps-input"),
      "10",
    );

    act(() => {
      fireEvent.press(screen.getByTestId("fizruk-workouts-set-editor-save"));
    });

    // Stage 8 PR #057f-tombstone: verify via UI — the set editor
    // closes after save, and a `-set-` row representing the appended
    // set is rendered on the active item card.
    expect(screen.queryByTestId("fizruk-workouts-set-editor-save")).toBeNull();
    const setRows = screen.getAllByTestId(/-set-\d+$/);
    expect(setRows.length).toBeGreaterThan(0);
  });
});
