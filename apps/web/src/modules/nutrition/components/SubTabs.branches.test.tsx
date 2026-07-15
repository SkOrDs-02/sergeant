// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubTabs } from "./SubTabs";

describe("SubTabs", () => {
  it("marks the active tab and switches on click", () => {
    const onChange = vi.fn();
    render(
      <SubTabs
        value="pantry"
        onChange={onChange}
        tabs={[
          { id: "pantry", label: "Комора" },
          { id: "shopping", label: "Покупки" },
        ]}
        ariaLabel="Підрозділи комори"
      />,
    );
    expect(screen.getByRole("tab", { name: "Комора" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("tab", { name: "Покупки" }));
    expect(onChange).toHaveBeenCalledWith("shopping");
  });
});
