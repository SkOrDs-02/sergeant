/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Avatar } from "./Avatar";

afterEach(cleanup);

describe("Avatar", () => {
  it("renders initials from a two-word name when no src is given", () => {
    const { container } = render(<Avatar name="Іван Петренко" />);
    const initials = container.querySelector('span[aria-hidden="true"]');
    expect(initials?.textContent).toBe("ІП");
  });

  it("renders a single-letter initial for a one-word name", () => {
    const { container } = render(<Avatar name="Олена" />);
    const initials = container.querySelector('span[aria-hidden="true"]');
    expect(initials?.textContent).toBe("О");
  });

  it("renders empty initials when name is omitted (default '')", () => {
    const { container } = render(<Avatar />);
    const initials = container.querySelector('span[aria-hidden="true"]');
    expect(initials?.textContent).toBe("");
  });

  it("renders an <img> with alt=name when src is provided", () => {
    const { container } = render(
      <Avatar name="Марія" src="https://example.com/a.png" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("Марія");
    expect(img?.getAttribute("loading")).toBe("lazy");
    // Initials fallback should not render alongside the image.
    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it("uses 'Avatar' alt fallback when src is set but name is empty", () => {
    const { container } = render(<Avatar src="https://example.com/a.png" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("alt")).toBe("Avatar");
  });

  it("does not render a status dot by default", () => {
    const { container } = render(<Avatar name="X" />);
    expect(container.querySelector('span[role="img"]')).toBeNull();
  });

  it("renders a status dot with the correct aria-label and color per status", () => {
    const cases = [
      ["online", "bg-success"],
      ["busy", "bg-warning"],
      ["offline", "bg-muted"],
    ] as const;
    for (const [status, bg] of cases) {
      const { container } = render(<Avatar name="X" status={status} />);
      const dot = container.querySelector('span[role="img"]');
      expect(dot).not.toBeNull();
      expect(dot?.getAttribute("aria-label")).toBe(status);
      expect(dot?.className).toContain(bg);
      cleanup();
    }
  });

  it("applies the requested size class", () => {
    const { container } = render(<Avatar name="X" size="xl" />);
    const wrapper = container.querySelector("span")!;
    expect(wrapper.className).toContain("h-14 w-14");
  });

  it("merges a custom className", () => {
    const { container } = render(<Avatar name="X" className="ring-2" />);
    const wrapper = container.querySelector("span")!;
    expect(wrapper.className).toContain("ring-2");
  });
});
