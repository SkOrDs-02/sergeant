/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Prose } from "./Prose";

afterEach(cleanup);

describe("Prose", () => {
  it("renders children inside a <div> by default", () => {
    const { container, getByText } = render(<Prose>hello</Prose>);
    expect(container.firstElementChild?.tagName).toBe("DIV");
    expect(getByText("hello")).toBeInTheDocument();
  });

  it("renders as a custom element via the `as` prop", () => {
    const { container } = render(<Prose as="article">body</Prose>);
    expect(container.firstElementChild?.tagName).toBe("ARTICLE");
  });

  it("applies the default (relaxed) rhythm classes", () => {
    const { container } = render(<Prose>x</Prose>);
    expect(container.firstElementChild!.className).toContain("[&>*+*]:mt-5");
  });

  it("applies compact rhythm + body-sm classes for variant='compact'", () => {
    const { container } = render(<Prose variant="compact">x</Prose>);
    const el = container.firstElementChild!;
    expect(el.className).toContain("[&>*+*]:mt-3");
    expect(el.className).toContain("[&_p]:text-style-label");
  });

  it("merges a custom className and forwards extra HTML attrs", () => {
    const { container } = render(
      <Prose className="extra" data-testid="prose-block">
        x
      </Prose>,
    );
    const el = container.firstElementChild!;
    expect(el.className).toContain("extra");
    expect(el.getAttribute("data-testid")).toBe("prose-block");
  });
});
