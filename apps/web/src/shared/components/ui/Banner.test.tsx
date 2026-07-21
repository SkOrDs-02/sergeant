// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Banner } from "./Banner";

describe("Banner", () => {
  it("renders the info variant by default with passthrough attributes", () => {
    render(
      <Banner data-testid="banner" aria-live="polite">
        Синхронізація готова
      </Banner>,
    );

    const banner = screen.getByTestId("banner");
    expect(banner).toHaveTextContent("Синхронізація готова");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner.className).toContain("bg-panelHi/60");
    expect(banner.className).toContain("text-text");
  });

  it.each([
    ["success", "bg-success-soft", "text-success-soft-fg"],
    ["warning", "bg-warning-soft", "text-warning-soft-fg"],
    ["danger", "bg-danger-soft", "text-danger-soft-fg"],
  ] as const)("applies %s status tokens", (variant, bgClass, fgClass) => {
    render(
      <Banner data-testid="banner" variant={variant}>
        Status
      </Banner>,
    );

    const banner = screen.getByTestId("banner");
    expect(banner.className).toContain(bgClass);
    expect(banner.className).toContain(fgClass);
  });

  it("merges caller classes after variant classes", () => {
    render(
      <Banner data-testid="banner" className="mt-2 shadow-sm">
        Custom
      </Banner>,
    );

    const banner = screen.getByTestId("banner");
    expect(banner.className).toContain("rounded-2xl");
    expect(banner.className).toContain("mt-2");
    expect(banner.className).toContain("shadow-sm");
  });
});
