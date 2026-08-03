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

  it("repaints exactly one complete selected day after today → tomorrow → week changes", () => {
    const props = {
      anchorKey: "2026-08-03",
      todayKey: "2026-08-03",
      onSelectDay: vi.fn(),
      onShiftWeek: vi.fn(),
    };
    const { rerender } = render(
      <WeekDayStrip {...props} selectedDay="2026-08-03" />,
    );

    const assertSelectedDay = (day: string) => {
      const dayButtons = screen
        .getAllByRole("button")
        .filter((button) => button.textContent?.match(/\d+/));
      expect(
        dayButtons.filter(
          (button) => button.getAttribute("aria-pressed") === "true",
        ),
      ).toHaveLength(1);
      const selected = dayButtons.find(
        (button) => button.getAttribute("aria-pressed") === "true",
      );
      expect(selected).toHaveTextContent(day);
      // WebKit can leave half of both the previous and next backgrounds
      // rasterised when colour transitions run inside a smooth snap scroller.
      expect(selected).not.toHaveClass("transition-colors");
    };

    assertSelectedDay("3");
    rerender(<WeekDayStrip {...props} selectedDay="2026-08-04" />);
    assertSelectedDay("4");
    rerender(<WeekDayStrip {...props} selectedDay="2026-08-03" />);
    assertSelectedDay("3");
  });
});
