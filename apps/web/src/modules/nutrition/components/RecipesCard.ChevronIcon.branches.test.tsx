// @vitest-environment jsdom
/**
 * Last validated: 2026-07-10
 * Status: Active
 */
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChevronIcon } from "./RecipesCard.ChevronIcon";

describe("ChevronIcon", () => {
  it("applies rotate-90 class when open", () => {
    const { container: closed } = render(<ChevronIcon open={false} />);
    expect(closed.querySelector(".rotate-90")).toBeNull();
    const { container: open } = render(<ChevronIcon open />);
    expect(open.querySelector(".rotate-90")).not.toBeNull();
  });
});
