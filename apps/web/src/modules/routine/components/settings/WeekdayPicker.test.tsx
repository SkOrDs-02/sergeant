// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WeekdayPicker } from "./WeekdayPicker";

describe("WeekdayPicker", () => {
  afterEach(cleanup);

  it("toggles weekday selection", () => {
    const onChange = vi.fn();
    render(<WeekdayPicker weekdays={[0, 3]} onChange={onChange} />);

    const monday = screen.getByRole("button", { name: "Пн" });
    expect(monday).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Вт" }));
    expect(onChange).toHaveBeenCalledWith([0, 1, 3]);
  });

  it("does not allow deselecting the last weekday", () => {
    const onChange = vi.fn();
    render(<WeekdayPicker weekdays={[2]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Ср" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("treats null weekdays as empty selection", () => {
    const onChange = vi.fn();
    render(<WeekdayPicker weekdays={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Пн" }));
    expect(onChange).toHaveBeenCalledWith([0]);
  });
});
