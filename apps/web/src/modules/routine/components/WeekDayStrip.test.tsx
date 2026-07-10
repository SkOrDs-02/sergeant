// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WeekDayStrip } from "./WeekDayStrip";

describe("WeekDayStrip", () => {
  afterEach(cleanup);

  it("renders seven day buttons and selects a day", () => {
    const onSelectDay = vi.fn();
    render(
      <WeekDayStrip
        anchorKey="2026-07-07"
        selectedDay="2026-07-09"
        todayKey="2026-07-10"
        onSelectDay={onSelectDay}
        onShiftWeek={vi.fn()}
      />,
    );

    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => b.textContent?.match(/\d+/));
    expect(dayButtons).toHaveLength(7);

    fireEvent.click(dayButtons[0]!);
    expect(onSelectDay).toHaveBeenCalled();
  });

  it("shifts week via prev/next controls", () => {
    const onShiftWeek = vi.fn();
    render(
      <WeekDayStrip
        anchorKey="2026-07-07"
        selectedDay="2026-07-09"
        todayKey="2026-07-10"
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
