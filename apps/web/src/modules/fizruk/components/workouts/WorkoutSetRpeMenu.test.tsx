// @vitest-environment jsdom
/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Unit coverage for the RPE (Borg 1..10) tap-to-pick control. Integration
 * with the live set row is covered separately in
 * `WorkoutItemCard.test.tsx` — this file locks the component's own
 * contract: optional-by-default display, the 1..10 grid, clear, and the
 * read-only static fallback.
 */
import { afterEach } from "vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { WorkoutSetRpeMenu } from "./WorkoutSetRpeMenu";

afterEach(cleanup);

describe("WorkoutSetRpeMenu", () => {
  it("shows an «RPE» caption and 'не вказано' aria-label when no value is set", () => {
    render(<WorkoutSetRpeMenu setNumber={1} value={null} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", {
      name: "Підхід 1: оцінка зусилля, не вказано",
    });
    expect(trigger).toHaveTextContent("RPE");
  });

  it("opens an inline panel (not a floating popover) with scale anchors and closes after a pick", () => {
    render(<WorkoutSetRpeMenu setNumber={2} value={null} onChange={vi.fn()} />);
    const trigger = screen.getByRole("button", {
      name: "Підхід 2: оцінка зусилля, не вказано",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: /Зусилля \(RPE\)/ });
    expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel).toHaveTextContent("1 · дуже легко");
    expect(panel).toHaveTextContent("10 · межа");
    fireEvent.click(screen.getByRole("button", { name: "RPE 7" }));
    expect(screen.queryByRole("group", { name: /Зусилля/ })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("Escape closes the panel without changing the value", () => {
    const onChange = vi.fn();
    render(<WorkoutSetRpeMenu setNumber={1} value={4} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Підхід 1: оцінка зусилля 4" }),
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "RPE 5" }), {
      key: "Escape",
    });
    expect(screen.queryByRole("group", { name: /Зусилля/ })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the numeric value once set", () => {
    render(<WorkoutSetRpeMenu setNumber={3} value={7} onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: "Підхід 3: оцінка зусилля 7" }),
    ).toHaveTextContent("7");
  });

  it("opens the picker on tap and calls onChange with the tapped value", () => {
    const onChange = vi.fn();
    render(
      <WorkoutSetRpeMenu setNumber={1} value={null} onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Підхід 1: оцінка зусилля, не вказано",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "RPE 10" }));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it("'Прибрати' is disabled with nothing to clear", () => {
    render(<WorkoutSetRpeMenu setNumber={1} value={null} onChange={vi.fn()} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Підхід 1: оцінка зусилля, не вказано",
      }),
    );
    expect(screen.getByRole("button", { name: "Прибрати" })).toBeDisabled();
  });

  it("'Прибрати' clears an existing value back to null", () => {
    const onChange = vi.fn();
    render(<WorkoutSetRpeMenu setNumber={1} value={5} onChange={onChange} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Підхід 1: оцінка зусилля 5" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Прибрати" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders a non-interactive badge (no picker) when disabled", () => {
    render(
      <WorkoutSetRpeMenu setNumber={1} value={6} disabled onChange={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /оцінка зусилля/ })).toBeNull();
    expect(screen.getByText("6")).toBeInTheDocument();
  });
});
