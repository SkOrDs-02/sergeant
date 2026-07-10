// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeeklyVolumeChart } from "./WeeklyVolumeChart";

afterEach(cleanup);

describe("WeeklyVolumeChart", () => {
  it("renders the empty-state when total volume is zero", () => {
    render(<WeeklyVolumeChart volumeKg={[0, 0, 0, 0, 0, 0, 0]} />);
    expect(screen.getByText("Поки без обʼєму за тиждень")).toBeInTheDocument();
  });

  it("renders the empty-state for missing / malformed input", () => {
    render(<WeeklyVolumeChart />);
    expect(screen.getByText("Поки без обʼєму за тиждень")).toBeInTheDocument();
  });

  it("renders the area chart with non-zero weekly volume", () => {
    render(<WeeklyVolumeChart volumeKg={[100, 200, 0, 400, 0, 600, 700]} />);
    const chart = screen.getByLabelText(
      "Графік обсягу тренувань за дні поточного тижня",
    );
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute(
      "aria-describedby",
      "fizruk-weekly-volume-summary",
    );
    expect(document.getElementById("fizruk-weekly-volume-summary")).toHaveClass(
      "sr-only",
    );
    // Day labels are present.
    expect(screen.getByText("Пн")).toBeInTheDocument();
    expect(screen.getByText("Нд")).toBeInTheDocument();
  });

  it("formats large y-axis values with a k suffix", () => {
    render(<WeeklyVolumeChart volumeKg={[2000, 0, 0, 0, 0, 0, 0]} />);
    // max = 2000 → top tick formatted as "2.0k"
    expect(screen.getByText("2.0k")).toBeInTheDocument();
  });
});
