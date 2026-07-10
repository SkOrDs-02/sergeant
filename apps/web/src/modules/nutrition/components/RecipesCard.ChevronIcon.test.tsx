// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 * Unit tests for RecipesCard chevron atom.
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChevronIcon } from "./RecipesCard.ChevronIcon";

describe("ChevronIcon", () => {
  it("applies rotation when open", () => {
    const { container, rerender } = render(<ChevronIcon open={false} />);
    const icon = container.querySelector("svg");
    expect(icon?.className.baseVal ?? icon?.getAttribute("class")).not.toMatch(
      /rotate-90/,
    );

    rerender(<ChevronIcon open />);
    const openIcon = container.querySelector("svg");
    expect(
      openIcon?.className.baseVal ?? openIcon?.getAttribute("class"),
    ).toMatch(/rotate-90/);
  });
});
