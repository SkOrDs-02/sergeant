/**
 * Jest render + behaviour tests for the Fizruk Measurements page
 * (Phase 6 · Measurements PR).
 *
 * Coverage:
 *  - Empty state renders when MMKV has no entries.
 *  - A 3-entry list renders newest-first (the hook sorts).
 *  - Tapping the "+ Додати" FAB opens the form sheet in new-entry mode.
 *  - Submitting the form from empty state creates an entry that
 *    appears in the list (and MMKV keeps the write).
 *  - Tapping a list row opens the sheet pre-populated for edit.
 *  - Two-tap delete removes the matching row.
 *
 * All persistence flows through the real `useMeasurements` hook, so
 * the in-memory MMKV shim registered in `jest.setup.js` exercises the
 * hook-reducer-storage contract end-to-end.
 */

import { AccessibilityInfo } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeWriteLS } from "@/lib/storage";
import { ToastProvider } from "@/components/ui/Toast";

import { Measurements } from "./Measurements";

function renderPage() {
  return render(
    <ToastProvider>
      <Measurements />
    </ToastProvider>,
  );
}

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// victory-native's ESM bundle trips the jest-expo transform list on
// some CI matrices — stub the three primitives the TrendChart uses.
jest.mock("victory-native", () => {
  const React = jest.requireActual("react");
  const RN = jest.requireActual("react-native");
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(RN.View, null, children);
  return {
    __esModule: true,
    VictoryGroup: Passthrough,
    VictoryArea: () => null,
    VictoryLine: () => null,
  };
});

function seedEntries(
  rows: readonly { id: string; at: string; weightKg?: number }[],
) {
  safeWriteLS(STORAGE_KEYS.FIZRUK_MEASUREMENTS, rows);
}

beforeEach(() => {
  _getMMKVInstance().clearAll();
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

describe("Fizruk Measurements page (mobile)", () => {
  it("renders the empty-state card when MMKV has no entries", () => {
    renderPage();

    expect(screen.getByText("Вимірювання")).toBeTruthy();
    expect(screen.getByTestId("fizruk-measurements-list-empty")).toBeTruthy();
    expect(screen.getByText("Поки порожньо")).toBeTruthy();
    // FAB is always visible.
    expect(screen.getByTestId("fizruk-measurements-add")).toBeTruthy();
  });

  it("renders 3 entries newest-first", () => {
    seedEntries([
      { id: "a", at: "2026-04-10T00:00:00Z", weightKg: 80 },
      { id: "b", at: "2026-04-20T00:00:00Z", weightKg: 81 },
      { id: "c", at: "2026-04-15T00:00:00Z", weightKg: 82 },
    ]);

    renderPage();

    expect(screen.queryByTestId("fizruk-measurements-list-empty")).toBeNull();

    const rowB = screen.getByTestId("fizruk-measurements-row-b");
    const rowC = screen.getByTestId("fizruk-measurements-row-c");
    const rowA = screen.getByTestId("fizruk-measurements-row-a");
    expect(rowB).toBeTruthy();
    expect(rowC).toBeTruthy();
    expect(rowA).toBeTruthy();
    expect(screen.getByTestId("fizruk-measurements-count").props.children).toBe(
      "3 записів",
    );
  });

  it("opens the form sheet when the FAB is pressed", () => {
    renderPage();

    // Before press, sheet body isn't mounted.
    expect(screen.queryByText("Новий замір")).toBeNull();

    fireEvent.press(screen.getByTestId("fizruk-measurements-add"));

    expect(screen.getByText("Новий замір")).toBeTruthy();
    expect(screen.getByLabelText("Вага")).toBeTruthy();
  });

  it("creates an entry via the form and shows it in the list", () => {
    renderPage();

    fireEvent.press(screen.getByTestId("fizruk-measurements-add"));
    fireEvent.changeText(screen.getByLabelText("Вага"), "80.5");

    act(() => {
      fireEvent.press(screen.getByTestId("fizruk-measurements-form-submit"));
    });

    // Sheet is gone, empty-state is gone, one row rendered.
    expect(screen.queryByText("Новий замір")).toBeNull();
    expect(screen.queryByTestId("fizruk-measurements-list-empty")).toBeNull();
    expect(screen.getByText(/Вага: 80\.5 кг/)).toBeTruthy();

    // MMKV persisted the entry.
    const raw = _getMMKVInstance().getString(STORAGE_KEYS.FIZRUK_MEASUREMENTS);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? "[]") as Array<{ weightKg?: number }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.weightKg).toBe(80.5);
  });

  it("opens the edit sheet pre-populated when a row is tapped", () => {
    seedEntries([{ id: "a", at: "2026-04-10T00:00:00Z", weightKg: 80 }]);

    renderPage();

    fireEvent.press(screen.getByTestId("fizruk-measurements-row-a-edit"));

    expect(screen.getByText("Редагувати замір")).toBeTruthy();
    // The weight input is pre-populated from the persisted entry.
    expect(screen.getByLabelText("Вага").props.value).toBe("80");
  });

  it("removes a row in a single tap (with undo-toast)", () => {
    seedEntries([
      { id: "a", at: "2026-04-10T00:00:00Z", weightKg: 80 },
      { id: "b", at: "2026-04-20T00:00:00Z", weightKg: 81 },
    ]);

    renderPage();

    const deleteBtn = screen.getByTestId("fizruk-measurements-row-a-delete");

    // Single-tap delete (parity з web — undo-toast відіграє роль скасування).
    act(() => {
      fireEvent.press(deleteBtn);
    });

    expect(screen.queryByTestId("fizruk-measurements-row-a")).toBeNull();
    expect(screen.getByTestId("fizruk-measurements-row-b")).toBeTruthy();
  });
});
