// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeekDayStrip } from "./WeekDayStrip";

afterEach(cleanup);

describe("WeekDayStrip", () => {
  const anchorKey = "2026-06-23"; // Monday
  const todayKey = "2026-06-25";

  it("renders seven day buttons for the anchored week", () => {
    render(
      <WeekDayStrip
        anchorKey={anchorKey}
        selectedDay="2026-06-23"
        todayKey={todayKey}
        onSelectDay={vi.fn()}
        onShiftWeek={vi.fn()}
      />,
    );
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("28")).toBeInTheDocument();
  });

  it("selects a day when a tile is clicked", () => {
    const onSelectDay = vi.fn();
    render(
      <WeekDayStrip
        anchorKey={anchorKey}
        selectedDay="2026-06-23"
        todayKey={todayKey}
        onSelectDay={onSelectDay}
        onShiftWeek={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("25").closest("button")!);
    expect(onSelectDay).toHaveBeenCalledWith("2026-06-25");
  });

  it("shifts the week via prev/next controls", () => {
    const onShiftWeek = vi.fn();
    render(
      <WeekDayStrip
        anchorKey={anchorKey}
        selectedDay="2026-06-23"
        todayKey={todayKey}
        onSelectDay={vi.fn()}
        onShiftWeek={onShiftWeek}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Попередній тиждень" }));
    expect(onShiftWeek).toHaveBeenCalledWith(-1);
    fireEvent.click(screen.getByRole("button", { name: "Наступний тиждень" }));
    expect(onShiftWeek).toHaveBeenCalledWith(1);
  });
});
