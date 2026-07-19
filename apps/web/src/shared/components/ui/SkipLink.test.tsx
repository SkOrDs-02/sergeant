/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SkipLink } from "./SkipLink";

afterEach(cleanup);

describe("SkipLink", () => {
  it("defaults to targeting #main with Ukrainian copy", () => {
    const { getByRole } = render(<SkipLink />);
    const link = getByRole("link", { name: "Перейти до основного вмісту" });
    expect(link.getAttribute("href")).toBe("#main");
  });

  it("targets a custom targetId", () => {
    const { getByRole } = render(<SkipLink targetId="content" />);
    const link = getByRole("link");
    expect(link.getAttribute("href")).toBe("#content");
  });

  it("renders a custom label", () => {
    const { getByRole } = render(<SkipLink label="Skip to content" />);
    expect(getByRole("link", { name: "Skip to content" })).toBeInTheDocument();
  });

  it("is visually hidden until focused (sr-only class present)", () => {
    const { getByRole } = render(<SkipLink />);
    expect(getByRole("link").className).toContain("sr-only");
  });

  it("merges a custom className", () => {
    const { getByRole } = render(<SkipLink className="custom-cls" />);
    expect(getByRole("link").className).toContain("custom-cls");
  });
});
