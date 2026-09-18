/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-08
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const coarse = vi.hoisted(() => ({ value: false }));
vi.mock("@shared/hooks/useCoarsePointer", () => ({
  useCoarsePointer: () => coarse.value,
}));

import { PantryPortionField } from "./PantryPortionField";

describe("PantryPortionField", () => {
  beforeEach(() => {
    coarse.value = false;
  });

  it("lets a pantry meal choose the consumed grams", () => {
    const onChange = vi.fn();
    render(<PantryPortionField value="100" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Вага порції, г"), {
      target: { value: "150" },
    });

    expect(onChange).toHaveBeenCalledWith("150");
  });

  it("does not accept a portion over the shared maximum", () => {
    const onChange = vi.fn();
    render(<PantryPortionField value="100" onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Вага порції, г"), {
      target: { value: "10001" },
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("uses the iOS-style wheel for pantry weight on touch devices", () => {
    coarse.value = true;
    const onChange = vi.fn();
    render(<PantryPortionField value="100" onChange={onChange} />);

    const wheel = screen.getByRole("spinbutton", {
      name: "Вага порції, г",
    });
    expect(wheel).toHaveAttribute("aria-valuenow", "100");

    fireEvent.keyDown(wheel, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith("105");
  });
});
