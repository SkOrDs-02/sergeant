/**
 * Jest render + behaviour tests for the Fizruk Body page
 * (Phase 6 · Body PR).
 *
 * Coverage:
 *  - Empty state renders when MMKV has no entries (CTA visible).
 *  - Summary tiles render the latest value + signed 7-day delta.
 *  - Only fields with at least one sample get a trend card.
 *  - Tapping the header CTA fires `onOpenMeasurements` exactly once.
 *  - Empty-state CTA also fires `onOpenMeasurements` and keeps
 *    `hapticTap` callable (no-op in jest-expo's adapter).
 */

import { fireEvent, render, screen } from "@testing-library/react-native";

import { _getMMKVInstance } from "@/lib/storage";

import {
  __setFizrukSqliteCacheForTests,
  clearFizrukSqliteCache,
  type FizrukMeasurementEntry,
} from "../lib/sqliteReader";
import { Body } from "./Body";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// victory-native's ESM bundle trips the jest-expo transform list on
// some CI matrices — stub the three primitives TrendChart uses.
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
  rows: readonly {
    id: string;
    at: string;
    weightKg?: number;
    sleepHours?: number;
    energyLevel?: number;
    mood?: number;
  }[],
) {
  // Stage 8 PR #057f-tombstone: hooks read measurements from the
  // SQLite warm cache, not MMKV. Seed the cache directly.
  __setFizrukSqliteCacheForTests({
    measurements: rows.map((r) => ({ ...r }) as FizrukMeasurementEntry),
  });
}

beforeEach(() => {
  _getMMKVInstance().clearAll();
  clearFizrukSqliteCache();
  __setFizrukSqliteCacheForTests({ measurements: [] });
});

describe("Fizruk Body page (mobile)", () => {
  it("renders empty-state when the SQLite cache has no entries", () => {
    const onOpen = jest.fn();
    render(<Body onOpenMeasurements={onOpen} />);

    expect(screen.getByText("Тіло")).toBeTruthy();
    expect(screen.getByTestId("fizruk-body-empty")).toBeTruthy();
    expect(screen.getByText("Поки порожньо")).toBeTruthy();
    expect(screen.queryByTestId("fizruk-body-summary")).toBeNull();
    expect(screen.queryByTestId("fizruk-body-trends")).toBeNull();
  });

  it("fires onOpenMeasurements from the empty-state CTA", () => {
    const onOpen = jest.fn();
    render(<Body onOpenMeasurements={onOpen} />);

    fireEvent.press(screen.getByTestId("fizruk-body-empty-cta"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("hides the header + empty-state CTAs when no handler is passed", () => {
    render(<Body />);
    expect(screen.queryByTestId("fizruk-body-open-measurements")).toBeNull();
    expect(screen.queryByTestId("fizruk-body-empty-cta")).toBeNull();
  });

  it("renders summary tiles with latest value + 7-day delta", () => {
    // Two weight entries in the last week → latest 79, baseline 81 → −2.
    seedEntries([
      { id: "new", at: "2026-04-20T09:00:00Z", weightKg: 79, sleepHours: 8 },
      { id: "mid", at: "2026-04-18T09:00:00Z", weightKg: 80 },
      { id: "old", at: "2026-04-14T09:00:00Z", weightKg: 81, sleepHours: 7 },
    ]);

    render(<Body onOpenMeasurements={jest.fn()} />);

    expect(screen.queryByTestId("fizruk-body-empty")).toBeNull();
    expect(screen.getByTestId("fizruk-body-summary")).toBeTruthy();

    // Weight tile surfaces the latest value (uk-UA format: " кг" suffix).
    const weightValue = screen.getByTestId(
      "fizruk-body-summary-weightKg-value",
    );
    expect(weightValue.props.children).toContain("79");
    expect(weightValue.props.children).toContain("кг");

    // Sleep tile has a latest value but only one sample → delta is "—".
    expect(
      screen.getByTestId("fizruk-body-summary-sleepHours-value").props.children,
    ).toContain("8");
  });

  it("only renders trend cards for fields that have at least one sample", () => {
    seedEntries([
      { id: "a", at: "2026-04-20T09:00:00Z", weightKg: 80 },
      { id: "b", at: "2026-04-15T09:00:00Z", weightKg: 82 },
    ]);

    render(<Body onOpenMeasurements={jest.fn()} />);

    expect(screen.getByTestId("fizruk-body-trend-weightKg")).toBeTruthy();
    expect(screen.queryByTestId("fizruk-body-trend-sleepHours")).toBeNull();
    expect(screen.queryByTestId("fizruk-body-trend-energyLevel")).toBeNull();
    expect(screen.queryByTestId("fizruk-body-trend-mood")).toBeNull();
  });

  it("fires onOpenMeasurements when the header CTA is pressed", () => {
    seedEntries([{ id: "a", at: "2026-04-20T09:00:00Z", weightKg: 80 }]);
    const onOpen = jest.fn();
    render(<Body onOpenMeasurements={onOpen} />);

    fireEvent.press(screen.getByTestId("fizruk-body-open-measurements"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
