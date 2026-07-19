/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Spinner } from "./Spinner";

afterEach(cleanup);

describe("Spinner", () => {
  it("is aria-hidden (decorative)", () => {
    const { container } = render(<Spinner />);
    const wrapper = container.querySelector('div[aria-hidden="true"]');
    expect(wrapper).not.toBeNull();
  });

  it("defaults to size='sm'", () => {
    const { container } = render(<Spinner />);
    const wrapper = container.querySelector('div[aria-hidden="true"]')!;
    expect(wrapper.className).toContain("h-4 w-4");
  });

  it("maps each size token to its class", () => {
    const cases = [
      ["xs", "h-3 w-3"],
      ["sm", "h-4 w-4"],
      ["md", "h-5 w-5"],
      ["lg", "h-6 w-6"],
    ] as const;
    for (const [size, cls] of cases) {
      const { container } = render(<Spinner size={size} />);
      const wrapper = container.querySelector('div[aria-hidden="true"]')!;
      expect(wrapper.className).toContain(cls);
      cleanup();
    }
  });

  it("merges a custom className on the wrapper", () => {
    const { container } = render(<Spinner className="text-brand" />);
    const wrapper = container.querySelector('div[aria-hidden="true"]')!;
    expect(wrapper.className).toContain("text-brand");
  });

  it("forwards extra SVG props to the inner <svg>", () => {
    const { container } = render(<Spinner data-testid="spin-svg" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("data-testid")).toBe("spin-svg");
    expect(svg?.getAttribute("focusable")).toBe("false");
  });
});
