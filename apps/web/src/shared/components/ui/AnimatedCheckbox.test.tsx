/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AnimatedCheckbox, HabitCheckbox } from "./AnimatedCheckbox";

afterEach(cleanup);

describe("AnimatedCheckbox — interactive", () => {
  it("renders a checkbox role reflecting the checked state", () => {
    render(<AnimatedCheckbox checked={false} aria-label="Готово" />);
    const cb = screen.getByRole("checkbox", { name: "Готово" });
    expect(cb.getAttribute("aria-checked")).toBe("false");
  });

  it("shows the checkmark icon only when checked", () => {
    const { rerender } = render(
      <AnimatedCheckbox checked={false} aria-label="X" />,
    );
    expect(screen.getByRole("checkbox").querySelector("svg")).toBeNull();
    rerender(<AnimatedCheckbox checked aria-label="X" />);
    expect(screen.getByRole("checkbox").querySelector("svg")).not.toBeNull();
  });

  it("calls onChange with the toggled value on click", () => {
    const onChange = vi.fn();
    render(
      <AnimatedCheckbox checked={false} onChange={onChange} aria-label="X" />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("toggles back to false when already checked", () => {
    const onChange = vi.fn();
    render(<AnimatedCheckbox checked onChange={onChange} aria-label="X" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does not fire onChange when disabled", () => {
    const onChange = vi.fn();
    render(
      <AnimatedCheckbox
        checked={false}
        disabled
        onChange={onChange}
        aria-label="X"
      />,
    );
    const cb = screen.getByRole("checkbox");
    expect(cb).toBeDisabled();
    fireEvent.click(cb);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses focus-visible ring tokens (Hard Rule #14)", () => {
    render(<AnimatedCheckbox checked={false} aria-label="X" />);
    const cb = screen.getByRole("checkbox");
    expect(cb.className).toMatch(/focus-visible:ring-/);
    expect(cb.className).not.toMatch(/(^|\s)focus:ring-/);
  });

  it("applies the variant fill token when checked", () => {
    render(<AnimatedCheckbox checked variant="routine" aria-label="X" />);
    expect(screen.getByRole("checkbox").className).toContain(
      "bg-routine-strong",
    );
  });
});

describe("AnimatedCheckbox — decorative", () => {
  it("renders without a checkbox role and is aria-hidden", () => {
    const { container } = render(<AnimatedCheckbox checked decorative />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Still shows the check indicator when checked.
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("HabitCheckbox", () => {
  it("renders the label and wires aria-label onto the inner checkbox", () => {
    render(<HabitCheckbox label="Ранкова пробіжка" checked={false} />);
    expect(screen.getByText("Ранкова пробіжка")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Ранкова пробіжка" }),
    ).toBeInTheDocument();
  });

  it("renders a streak badge when streak > 0", () => {
    render(<HabitCheckbox label="Звичка" checked streak={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("omits the streak badge when streak is 0", () => {
    render(<HabitCheckbox label="Звичка" checked={false} streak={0} />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("renders an optional subtitle", () => {
    render(
      <HabitCheckbox
        label="Звичка"
        checked={false}
        subtitle="щоранку о 7:00"
      />,
    );
    expect(screen.getByText("щоранку о 7:00")).toBeInTheDocument();
  });
});
