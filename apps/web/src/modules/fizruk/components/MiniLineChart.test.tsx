// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MiniLineChart, type MiniLineChartDataPoint } from "./MiniLineChart";

afterEach(cleanup);

function points(values: Array<number | null>): MiniLineChartDataPoint[] {
  return values.map((v, i) => ({ value: v, label: `d${i}` }));
}

describe("MiniLineChart", () => {
  it("renders an empty-state when there are no numeric points", () => {
    render(<MiniLineChart data={[]} unit="кг" color="#f00" />);
    expect(screen.getByText("Немає числових даних")).toBeInTheDocument();
  });

  it("renders the too-few-points state with a single value", () => {
    render(<MiniLineChart data={points([80])} unit="кг" color="#f00" />);
    expect(screen.getByText("Замало точок для лінії")).toBeInTheDocument();
  });

  it("renders an SVG chart for two or more points", () => {
    render(
      <MiniLineChart
        data={points([80, 81, 82])}
        unit="кг"
        color="#00ff00"
        metricLabel="вагу"
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("aria-label", expect.stringContaining("вагу"));
    expect(img).toHaveAttribute("aria-describedby", "fizruk-mini-line-вагу");
    expect(document.getElementById("fizruk-mini-line-вагу")).toHaveClass(
      "sr-only",
    );
    // Last value rendered in the footer (value + unit, split across nodes).
    expect(
      screen.getByText((_content, el) => el?.textContent === "82 кг"),
    ).toBeInTheDocument();
  });

  it("shows a positive delta with a + sign", () => {
    render(<MiniLineChart data={points([80, 85])} unit="кг" color="#00f" />);
    expect(screen.getAllByText(/\+5\.0 кг/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows a negative delta", () => {
    render(<MiniLineChart data={points([85, 80])} unit="кг" color="#00f" />);
    expect(screen.getAllByText(/-5\.0 кг/).length).toBeGreaterThanOrEqual(1);
  });

  it("handles gaps (null points) without crashing", () => {
    render(
      <MiniLineChart
        data={points([80, null, 82, 83, null, 85])}
        unit="%"
        color="#abc"
      />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders many points (label thinning path)", () => {
    render(
      <MiniLineChart
        data={points([70, 71, 72, 73, 74, 75, 76])}
        unit="кг"
        color="#123"
      />,
    );
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
