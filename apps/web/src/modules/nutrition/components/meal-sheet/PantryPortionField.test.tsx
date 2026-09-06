/** @vitest-environment jsdom */
/**
 * Last validated: 2026-09-06
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PantryPortionField } from "./PantryPortionField";

describe("PantryPortionField", () => {
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
});
