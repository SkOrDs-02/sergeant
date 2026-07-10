/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BrandLogo } from "./BrandLogo";

describe("BrandLogo — shell variants", () => {
  afterEach(() => cleanup());

  it("renders the badge variant with wordmark by default", () => {
    render(<BrandLogo />);
    expect(screen.getByText("Sergeant")).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("renders mark-only variant without wordmark", () => {
    render(<BrandLogo variant="mark" />);
    expect(screen.queryByText("Sergeant")).toBeNull();
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("renders inline variant with wordmark beside the mark", () => {
    const { container } = render(<BrandLogo variant="inline" size="md" />);
    expect(screen.getByText("Sergeant")).toBeInTheDocument();
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toMatch(/\binline-flex\b/);
  });

  it("honours the `as` prop for heading landmarks", () => {
    render(<BrandLogo as="h1" variant="inline" />);
    const heading = screen.getByRole("heading", { level: 1, name: /Sergeant/ });
    expect(heading).toBeInTheDocument();
  });

  it("applies extra className on the outer wrapper", () => {
    const { container } = render(
      <BrandLogo className="mx-auto test-logo" variant="mark" />,
    );
    expect(container.firstElementChild?.className).toMatch(/\btest-logo\b/);
    expect(container.firstElementChild?.className).toMatch(/\bmx-auto\b/);
  });
});
