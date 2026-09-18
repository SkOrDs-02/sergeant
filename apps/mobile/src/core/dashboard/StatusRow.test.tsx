/**
 * Smoke tests for the mobile `StatusRow`. Focus on the quick-stats
 * preview wiring added in HubDashboard PR-3 — the pre-existing row
 * rendering (icon, label, chevron) is already covered indirectly
 * through `DraggableDashboard.test.tsx` and is not duplicated here.
 */

import { render } from "@testing-library/react-native";

import { StatusRow } from "./StatusRow";

describe("StatusRow (preview wiring)", () => {
  it("renders without a preview section when no preview prop is passed", () => {
    const { queryByTestId } = render(<StatusRow id="finyk" />);

    expect(queryByTestId("dashboard-row-finyk-preview")).toBeNull();
    expect(queryByTestId("dashboard-row-finyk-progress")).toBeNull();
  });

  it("renders without a preview section when both main and sub are null", () => {
    const { queryByTestId } = render(
      <StatusRow id="finyk" preview={{ main: null, sub: null }} />,
    );

    expect(queryByTestId("dashboard-row-finyk-preview")).toBeNull();
  });

  it("renders main + sub when preview carries content", () => {
    const { getByTestId, getByText } = render(
      <StatusRow
        id="finyk"
        preview={{ main: "₴1 234", sub: "ліміт: ₴5 000" }}
      />,
    );

    expect(getByTestId("dashboard-row-finyk-preview")).toBeTruthy();
    expect(getByText("₴1 234")).toBeTruthy();
    expect(getByText("ліміт: ₴5 000")).toBeTruthy();
  });

  it("renders a progress bar clamped into [0, 100] when progress is supplied", () => {
    const { getByTestId } = render(
      <StatusRow
        id="routine"
        preview={{ main: "3/5", sub: "дні: 7", progress: 142 }}
      />,
    );

    const bar = getByTestId("dashboard-row-routine-progress");
    expect(bar).toBeTruthy();
    // `accessibilityValue.now` is clamped by `clampProgress` before
    // being forwarded — 142 → 100.
    expect(bar.props.accessibilityValue).toEqual({ now: 100 });
  });

  it("renders only main when sub is absent", () => {
    const { getByText, queryByText } = render(
      <StatusRow id="fizruk" preview={{ main: "3 тренування", sub: null }} />,
    );

    expect(getByText("3 тренування")).toBeTruthy();
    expect(queryByText(/дні:/)).toBeNull();
  });
});
