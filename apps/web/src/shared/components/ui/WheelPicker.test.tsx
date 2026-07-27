// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WheelPicker } from "./WheelPicker";

const VALUES = [0, 25, 50, 75, 100, 125, 150];

// jsdom lacks matchMedia; WheelPicker reads it via useReducedMotion.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
});

describe("WheelPicker", () => {
  it("exposes spinbutton semantics with current value", () => {
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={() => {}}
        aria-label="Порція"
      />,
    );
    const spin = screen.getByRole("spinbutton", { name: "Порція" });
    expect(spin).toHaveAttribute("aria-valuenow", "50");
    expect(spin).toHaveAttribute("aria-valuemin", "0");
    expect(spin).toHaveAttribute("aria-valuemax", "150");
  });

  it("ArrowUp selects the next-larger value", () => {
    const onChange = vi.fn();
    render(<WheelPicker values={VALUES} value={50} onChange={onChange} aria-label="v" />);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("ArrowDown selects the next-smaller value", () => {
    const onChange = vi.fn();
    render(<WheelPicker values={VALUES} value={50} onChange={onChange} aria-label="v" />);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(25);
  });

  it("clamps at the bounds", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WheelPicker values={VALUES} value={0} onChange={onChange} aria-label="v" />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled(); // already at min

    rerender(<WheelPicker values={VALUES} value={150} onChange={onChange} aria-label="v" />);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled(); // already at max
  });

  it("Home/End jump to first/last", () => {
    const onChange = vi.fn();
    render(<WheelPicker values={VALUES} value={50} onChange={onChange} aria-label="v" />);
    const spin = screen.getByRole("spinbutton");
    fireEvent.keyDown(spin, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(150);
    fireEvent.keyDown(spin, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("PageUp/PageDown move by 5 steps (clamped)", () => {
    const onChange = vi.fn();
    render(<WheelPicker values={VALUES} value={50} onChange={onChange} aria-label="v" />);
    const spin = screen.getByRole("spinbutton");
    fireEvent.keyDown(spin, { key: "PageUp" }); // index 2 + 5 = 7 → clamp 6 → 150
    expect(onChange).toHaveBeenLastCalledWith(150);
    fireEvent.keyDown(spin, { key: "PageDown" }); // index 2 - 5 → clamp 0 → 0
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("highlights the nearest value when value is not an exact member", () => {
    render(<WheelPicker values={VALUES} value={60} onChange={() => {}} aria-label="v" />);
    // nearest to 60 is 50 (dist 10) vs 75 (dist 15)
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuenow", "50");
  });

  it("does not respond to keys when disabled", () => {
    const onChange = vi.fn();
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={onChange}
        disabled
        aria-label="v"
      />,
    );
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies formatValue and unit to aria-valuetext", () => {
    render(
      <WheelPicker
        values={VALUES}
        value={50}
        onChange={() => {}}
        formatValue={(v) => `${v}g`}
        aria-label="v"
      />,
    );
    expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-valuetext", "50g");
  });
});
