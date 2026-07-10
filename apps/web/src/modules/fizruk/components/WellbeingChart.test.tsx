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
});
