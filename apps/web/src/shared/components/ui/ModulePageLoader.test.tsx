/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ModulePageLoader } from "./ModulePageLoader";

afterEach(cleanup);

describe("ModulePageLoader", () => {
  it("renders an accessible busy status region", () => {
    render(<ModulePageLoader />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBeTruthy();
  });

  it("defaults to the generic loader and renders skeleton blocks", () => {
    const { container } = render(<ModulePageLoader />);
    // Generic loader renders several rounded panel cards.
    expect(container.querySelectorAll(".bg-panel").length).toBeGreaterThan(0);
  });

  it("renders the finyk-specific loader layout", () => {
    const { container } = render(<ModulePageLoader module="finyk" />);
    // Finyk summary card carries the finyk-soft tint.
    expect(container.querySelector('[class*="finyk-soft"]')).not.toBeNull();
  });

  it("renders the fizruk-specific loader layout", () => {
    const { container } = render(<ModulePageLoader module="fizruk" />);
    expect(container.querySelector('[class*="fizruk-soft"]')).not.toBeNull();
  });

  it("renders the routine-specific loader layout", () => {
    const { container } = render(<ModulePageLoader module="routine" />);
    expect(
      container.querySelector('[class*="routine-surface"]'),
    ).not.toBeNull();
  });

  it("renders the nutrition-specific loader layout", () => {
    const { container } = render(<ModulePageLoader module="nutrition" />);
    expect(container.querySelector('[class*="nutrition-soft"]')).not.toBeNull();
  });

  it("forwards className onto the outer wrapper", () => {
    render(<ModulePageLoader className="extra-class" />);
    expect(screen.getByRole("status").className).toContain("extra-class");
  });
});
