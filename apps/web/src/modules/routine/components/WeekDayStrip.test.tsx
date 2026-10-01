// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WeekDayStrip, WeekShiftControls } from "./WeekDayStrip";

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
      />,
    );

    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => b.textContent?.match(/\d+/));
    expect(dayButtons).toHaveLength(7);

    fireEvent.click(dayButtons[0]!);
    expect(onSelectDay).toHaveBeenCalled();
  });

  /**
   * Шеврони переїхали з ряду днів у рядок заголовка (`WeekShiftControls`) —
   * у ряду вони забирали 100px і не давали семи клітинкам влізти без
   * скролера, а скролер на iOS давав рожеві смуги. Див. `AI-DANGER` у
   * `WeekDayStrip`.
   */
  it("shifts week via prev/next controls", () => {
    const onShiftWeek = vi.fn();
    render(<WeekShiftControls onShiftWeek={onShiftWeek} />);

    fireEvent.click(screen.getByRole("button", { name: "Попередній тиждень" }));
    expect(onShiftWeek).toHaveBeenCalledWith(-1);

    fireEvent.click(screen.getByRole("button", { name: "Наступний тиждень" }));
    expect(onShiftWeek).toHaveBeenCalledWith(1);
  });

  it("не тримає горизонтального скролера в ряду днів", () => {
    const { container } = render(
      <WeekDayStrip
        anchorKey="2026-07-07"
        selectedDay="2026-07-09"
        todayKey="2026-07-10"
        onSelectDay={vi.fn()}
      />,
    );

    expect(container.querySelector(".overflow-x-auto")).toBeNull();
    const grid = container.querySelector(".grid");
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid-cols-4");
    expect(grid?.className).toContain("sm:grid-cols-7");
  });

  it("repaints exactly one complete selected day after today → tomorrow → week changes", () => {
    const props = {
      anchorKey: "2026-08-03",
      todayKey: "2026-08-03",
      onSelectDay: vi.fn(),
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

  it("вибраний день: тонований фон + контур `routine-edge`, а не тихий `routine-ring` (A4 аудиту контрасту)", () => {
    // Тихий контур (`routine-ring`, 1.63 / 2.41 проти сусіда) для СТАНУ замало:
    // WCAG 1.4.11 вимагає ≥3:1. `routine-edge` = `--c-routine-ink` (світла -800,
    // темна -400); гейт чисел — `packages/design-tokens/contrast.test.js`.
    render(
      <WeekDayStrip
        anchorKey="2026-08-03"
        selectedDay="2026-08-04"
        todayKey="2026-08-03"
        onSelectDay={vi.fn()}
      />,
    );
    const selected = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "true");
    expect(selected).toHaveClass("border-routine-edge", "bg-routine-surface2");
    expect(selected?.className).not.toMatch(
      /border-routine-ring|ring-routine-line/,
    );
    // Невибраний день не змінився: прозора межа, висота не стрибає.
    const other = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "false");
    expect(other).toHaveClass("border-transparent");
  });
});
