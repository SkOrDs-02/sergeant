// @vitest-environment jsdom
/**
 * Tests for `Slider` — keyboard model, controlled/uncontrolled single +
 * range modes, pointer drag, and the disabled guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { Slider } from "./Slider";

function getThumbs(): HTMLElement[] {
  return screen.getAllByRole("slider");
}

describe("Slider (single mode)", () => {
  it("renders one thumb with correct ARIA bounds", () => {
    render(<Slider aria-label="Vol" min={0} max={100} defaultValue={40} />);
    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("aria-valuemin", "0");
    expect(thumb).toHaveAttribute("aria-valuemax", "100");
    expect(thumb).toHaveAttribute("aria-valuenow", "40");
  });

  it("increments by step on ArrowRight (uncontrolled)", () => {
    const onChange = vi.fn();
    render(
      <Slider
        aria-label="Vol"
        defaultValue={40}
        step={5}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(45);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "45");
  });

  it("decrements on ArrowDown and multiplies step ×10 with Shift", () => {
    const onChange = vi.fn();
    render(
      <Slider
        aria-label="Vol"
        defaultValue={50}
        step={2}
        onChange={onChange}
      />,
    );
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(48);
    fireEvent.keyDown(thumb, { key: "ArrowUp", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(68); // 48 + 2*10
  });

  it("jumps to min/max on Home/End", () => {
    const onChange = vi.fn();
    render(
      <Slider
        aria-label="Vol"
        min={10}
        max={90}
        defaultValue={50}
        onChange={onChange}
      />,
    );
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(10);
    fireEvent.keyDown(thumb, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(90);
  });

  it("pages by 10% of the range on PageUp/PageDown", () => {
    const onChange = vi.fn();
    render(
      <Slider
        aria-label="Vol"
        min={0}
        max={100}
        defaultValue={50}
        onChange={onChange}
      />,
    );
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "PageUp" });
    expect(onChange).toHaveBeenLastCalledWith(60);
    fireEvent.keyDown(thumb, { key: "PageDown" });
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  it("clamps at the max boundary", () => {
    const onChange = vi.fn();
    render(
      <Slider
        aria-label="Vol"
        max={100}
        defaultValue={100}
        onChange={onChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "100");
  });

  it("ignores unrelated keys", () => {
    const onChange = vi.fn();
    render(<Slider aria-label="Vol" defaultValue={40} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects controlled value (does not self-update)", () => {
    const onChange = vi.fn();
    render(<Slider aria-label="Vol" value={30} onChange={onChange} step={1} />);
    const thumb = screen.getByRole("slider");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(31);
    // value stays 30 because the parent owns it
    expect(thumb).toHaveAttribute("aria-valuenow", "30");
  });

  it("does not respond when disabled", () => {
    const onChange = vi.fn();
    render(
      <Slider
        aria-label="Vol"
        defaultValue={40}
        disabled
        onChange={onChange}
      />,
    );
    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(thumb, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses formatValue for aria-valuetext", () => {
    render(
      <Slider
        aria-label="Vol"
        defaultValue={50}
        formatValue={(n) => `${n}%`}
        showTooltip
      />,
    );
    const thumb = screen.getByRole("slider");
    expect(thumb).toHaveAttribute("aria-valuetext", "50%");
    fireEvent.focus(thumb);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});

describe("Slider (range mode)", () => {
  it("renders two thumbs and prevents them from crossing", () => {
    const onChange = vi.fn();
    render(
      <Slider
        range
        aria-label="Price"
        min={0}
        max={100}
        defaultValue={[20, 80]}
        onChange={onChange}
      />,
    );
    const thumbs = getThumbs();
    expect(thumbs).toHaveLength(2);
    // push lower thumb up toward (and past) the upper — it should cap at hi
    fireEvent.keyDown(thumbs[0]!, { key: "End" }); // tries to go to max 100
    const call = onChange.mock.calls.at(-1)![0] as [number, number];
    expect(call[0]).toBeLessThanOrEqual(call[1]);
    expect(call[1]).toBe(80);
  });

  it("moves the upper thumb independently", () => {
    const onChange = vi.fn();
    render(
      <Slider
        range
        aria-label="Price"
        defaultValue={[20, 60]}
        onChange={onChange}
      />,
    );
    const thumbs = getThumbs();
    fireEvent.keyDown(thumbs[1]!, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith([20, 61]);
  });
});

describe("Slider pointer interaction", () => {
  beforeEach(() => {
    // jsdom lacks pointer-capture; stub so the handlers don't throw.
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 10,
        right: 200,
        bottom: 10,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
  });

  it("commits a value on track pointer-down at a fractional position", () => {
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    const { container } = render(
      <Slider
        aria-label="Vol"
        min={0}
        max={100}
        defaultValue={0}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    );
    const track = container.querySelector("[data-slider-id] > div")!;
    fireEvent.pointerDown(track, { clientX: 100, clientY: 5, pointerId: 1 });
    // 100/200 = 50% of [0,100] → 50
    expect(onChange).toHaveBeenCalledWith(50);
    fireEvent.pointerUp(track, { clientX: 100, clientY: 5, pointerId: 1 });
    expect(onChangeEnd).toHaveBeenCalled();
  });
});
