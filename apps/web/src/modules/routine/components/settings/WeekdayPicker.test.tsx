// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeekdayPicker } from "./WeekdayPicker";

afterEach(cleanup);

describe("WeekdayPicker", () => {
  it("toggles weekdays and keeps at least one selected", () => {
    const onChange = vi.fn();
    render(<WeekdayPicker weekdays={[1, 3]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Вт" }));
    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it("does not allow deselecting the last weekday", () => {
    const onChange = vi.fn();
    render(<WeekdayPicker weekdays={[2]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Ср" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("adds a weekday when an inactive chip is clicked", () => {
    const onChange = vi.fn();
    render(<WeekdayPicker weekdays={[1]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Пт" }));
    expect(onChange).toHaveBeenCalledWith([1, 4]);
  });
});
