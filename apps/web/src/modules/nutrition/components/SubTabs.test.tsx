// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for inline segmented sub-tabs control.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SubTabs } from "./SubTabs";

const TABS = [
  { id: "pantry", label: "Склад" },
  { id: "shopping", label: "Покупки" },
];

describe("SubTabs", () => {
  it("marks the active tab and calls onChange when another tab is tapped", () => {
    const onChange = vi.fn();
    render(
      <SubTabs
        value="pantry"
        onChange={onChange}
        tabs={TABS}
        ariaLabel="Розділи складу"
      />,
    );

    const pantry = screen.getByRole("tab", { name: "Склад" });
    const shopping = screen.getByRole("tab", { name: "Покупки" });
    expect(pantry).toHaveAttribute("aria-selected", "true");
    expect(shopping).toHaveAttribute("aria-selected", "false");

    fireEvent.click(shopping);
    expect(onChange).toHaveBeenCalledWith("shopping");
  });
});
