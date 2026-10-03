// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WellbeingChart } from "./WellbeingChart";

afterEach(cleanup);

describe("WellbeingChart", () => {
  it("renders the no-data empty state", () => {
    render(<WellbeingChart data={null} />);
    expect(screen.getByText("Немає даних для графіка")).toBeInTheDocument();
  });

  it("renders the too-few-points state for a single workout", () => {
    render(<WellbeingChart data={[{ label: "Пн", energy: 4, mood: 5 }]} />);
    expect(screen.getByText("Замало точок")).toBeInTheDocument();
  });

  it("renders the grouped bar chart with a legend for >= 2 points", () => {
    render(
      <WellbeingChart
        data={[
          { label: "Пн", energy: 4, mood: 5 },
          { label: "Ср", energy: 2, mood: null },
          { label: "Пт", energy: null, mood: 3 },
        ]}
      />,
    );
    expect(screen.getByLabelText("Графік самопочуття")).toBeInTheDocument();
    expect(screen.getByLabelText("Графік самопочуття")).toHaveAttribute(
      "aria-describedby",
      "fizruk-wellbeing-summary",
    );
    expect(document.getElementById("fizruk-wellbeing-summary")).toHaveClass(
      "sr-only",
    );
    expect(screen.getByText("Енергія")).toBeInTheDocument();
    expect(screen.getByText("Настрій")).toBeInTheDocument();
  });

  it("uses var-backed chart-status tokens, not hardcoded rgb(), for the bars (#1)", () => {
    const { container } = render(
      <WellbeingChart
        data={[
          { label: "Пн", energy: 4, mood: 5 },
          { label: "Ср", energy: 2, mood: 3 },
        ]}
      />,
    );
    const bars = Array.from(container.querySelectorAll("rect[fill]"));
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => {
      const fill = bar.getAttribute("fill");
      // Theme-blind static rgb()/hex must never leak into an SVG paint
      // attribute here — only the var-backed chart-status tokens.
      expect(fill).toMatch(/^rgb\(var\(--c-chart-(success|info)\)\)$/);
    });
  });

  it("keeps x-axis tick labels at the 10px chart-tick floor, not 8px (#5)", () => {
    const { container } = render(
      <WellbeingChart
        data={[
          { label: "Пн", energy: 4, mood: 5 },
          { label: "Ср", energy: 2, mood: 3 },
        ]}
      />,
    );
    const labels = container.querySelectorAll("text");
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach((label) => {
      expect(Number(label.getAttribute("font-size"))).toBeGreaterThanOrEqual(
        10,
      );
    });
  });

  it("thins x-axis labels to at most 4 for long series (#5)", () => {
    const { container } = render(
      <WellbeingChart
        data={Array.from({ length: 8 }, (_, i) => ({
          label: `d${i}`,
          energy: 3,
          mood: 3,
        }))}
      />,
    );
    expect(container.querySelectorAll("text").length).toBeLessThanOrEqual(4);
  });
});
