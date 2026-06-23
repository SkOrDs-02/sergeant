// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  ExerciseProgressChart,
  type ProgressPoint,
} from "./ExerciseProgressChart";

afterEach(cleanup);

function pts(values: number[]): ProgressPoint[] {
  return values.map((v, i) => ({ value: v, dateLabel: `${i + 1}.01` }));
}

describe("ExerciseProgressChart", () => {
  it("shows the too-few-points hint for < 2 points", () => {
    render(
      <ExerciseProgressChart
        points={pts([50])}
        label="Жим"
        unit="кг"
        color="#f00"
      />,
    );
    expect(
      screen.getByText("Потрібно щонайменше 2 тренування для графіка"),
    ).toBeInTheDocument();
  });

  it("renders the SVG chart and a positive delta", () => {
    render(
      <ExerciseProgressChart
        points={pts([50, 55, 60])}
        label="Жим"
        unit="кг"
        color="#0f0"
      />,
    );
    expect(screen.getByLabelText("Графік Жим")).toBeInTheDocument();
    expect(screen.getByText(/\+10\.0 кг/)).toBeInTheDocument();
  });

  it("renders a negative delta", () => {
    render(
      <ExerciseProgressChart
        points={pts([60, 50])}
        label="Тяга"
        unit="кг"
        color="#00f"
      />,
    );
    expect(screen.getByText(/-10\.0 кг/)).toBeInTheDocument();
  });

  it("renders mid-point label for long series (n > 3)", () => {
    render(
      <ExerciseProgressChart
        points={pts([10, 20, 30, 40, 50])}
        label="Присід"
        unit="кг"
        color="#abc"
      />,
    );
    expect(screen.getByLabelText("Графік Присід")).toBeInTheDocument();
  });
});
