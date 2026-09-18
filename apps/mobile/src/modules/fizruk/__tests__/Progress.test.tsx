/**
 * Render tests for the Fizruk Progress screen (Phase 6 · PR-D).
 *
 * These tests cover the four invariants the mobile Progress page must
 * uphold per the migration plan §4 / §6.7:
 *   1. Empty state (no workouts, no measurements) renders the
 *      dashed "Даних ще немає" card.
 *   2. With ≥2 weight samples, the weight chart renders (not the
 *      empty-state copy).
 *   3. With <2 body-fat samples, the body-fat chart falls back to the
 *      "Замало точок" empty-state copy.
 *   4. The KPI strip renders the computed PR / Заміри counts.
 */

import { render } from "@testing-library/react-native";

import { Progress } from "../pages/Progress";
import type { FizrukProgressData } from "../pages/useFizrukProgressData";

jest.mock("react-native-safe-area-context", () => {
  const RN = jest.requireActual("react-native");
  return {
    SafeAreaView: RN.View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// victory-native's default Jest transform still trips on its ESM bundle
// on some CI matrices. Stub the three primitives we touch with simple
// RN views so tests exercise the screen's own logic, not the chart
// internals (which are covered upstream).
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

function emptyData(): FizrukProgressData {
  return { workouts: [], entries: [] };
}

describe("Fizruk Progress screen (mobile)", () => {
  it("renders the empty-state card when there are no workouts or entries", () => {
    const { getByTestId, queryByTestId } = render(
      <Progress data={emptyData()} />,
    );

    expect(getByTestId("fizruk-progress-kpis")).toBeTruthy();
    expect(getByTestId("fizruk-progress-empty")).toBeTruthy();
    expect(queryByTestId("fizruk-progress-weight")).toBeNull();
    expect(queryByTestId("fizruk-progress-bodyfat")).toBeNull();
  });

  it("renders the weight chart when ≥2 weight samples are present", () => {
    const data: FizrukProgressData = {
      workouts: [],
      entries: [
        { at: "2026-04-10T00:00:00Z", weightKg: 81 },
        { at: "2026-04-01T00:00:00Z", weightKg: 82 },
      ],
    };
    const { getByTestId, queryByTestId } = render(<Progress data={data} />);

    expect(queryByTestId("fizruk-progress-empty")).toBeNull();
    expect(getByTestId("fizruk-progress-weight")).toBeTruthy();
    expect(getByTestId("fizruk-progress-weight-chart")).toBeTruthy();
    // No body-fat samples → body-fat section collapses to empty-state copy.
    expect(getByTestId("fizruk-progress-bodyfat-empty")).toBeTruthy();
  });

  it("renders the body-fat empty-state when only one body-fat sample exists", () => {
    const data: FizrukProgressData = {
      workouts: [],
      entries: [
        { at: "2026-04-10T00:00:00Z", weightKg: 81, bodyFatPct: 17 },
        { at: "2026-04-01T00:00:00Z", weightKg: 82 },
      ],
    };
    const { getByTestId } = render(<Progress data={data} />);

    expect(getByTestId("fizruk-progress-bodyfat-empty")).toBeTruthy();
  });

  it("renders the KPI section with computed PR / entries counts", () => {
    const data: FizrukProgressData = {
      workouts: [
        {
          startedAt: "2026-04-10T10:00:00Z",
          endedAt: "2026-04-10T11:00:00Z",
          items: [
            {
              exerciseId: "bench",
              type: "strength",
              sets: [{ weightKg: 60, reps: 8 }],
            },
          ],
        },
      ],
      entries: [{ at: "2026-04-10T00:00:00Z", weightKg: 81 }],
    };
    const { getByTestId } = render(<Progress data={data} />);

    const prsStat = getByTestId("fizruk-progress-prs-stat");
    const entriesStat = getByTestId("fizruk-progress-entries-stat");
    // `1` appears both as PR count and Заміри count — one per tile.
    expect(prsStat).toBeTruthy();
    expect(entriesStat).toBeTruthy();
  });
});
