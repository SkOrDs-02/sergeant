// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkoutStatTile } from "./WorkoutStatTile";

afterEach(cleanup);

describe("WorkoutStatTile", () => {
  it("renders label and value with the default sm size", () => {
    render(<WorkoutStatTile label="Тривалість" value="42 хв" />);
    expect(screen.getByText("Тривалість")).toBeInTheDocument();
    expect(screen.getByText("42 хв")).toHaveClass("text-sm");
  });

  it("uses the lg size class for hero metrics", () => {
    render(<WorkoutStatTile label="Вправ" value={8} size="lg" />);
    expect(screen.getByText("8")).toHaveClass("text-lg");
  });
});
