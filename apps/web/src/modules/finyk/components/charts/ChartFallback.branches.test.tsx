// @vitest-environment jsdom
/**
 * Branch coverage for ChartFallback — default and custom className.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ChartFallback } from "./ChartFallback";

afterEach(() => cleanup());

describe("ChartFallback (branches)", () => {
  it("renders skeleton with default height classes", () => {
    const { container } = render(<ChartFallback />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton.className).toMatch(/h-20/);
    expect(skeleton.className).toMatch(/rounded-xl/);
  });

  it("merges custom className onto skeleton", () => {
    const { container } = render(<ChartFallback className="h-32 opacity-50" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.className).toMatch(/h-32/);
    expect(skeleton.className).toMatch(/opacity-50/);
  });
});
