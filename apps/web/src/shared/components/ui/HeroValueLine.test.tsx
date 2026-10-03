/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { HeroValueLine } from "./HeroValueLine";

afterEach(cleanup);

describe("HeroValueLine", () => {
  it("renders narrative and metric", () => {
    const { getByText } = render(
      <HeroValueLine narrative="Контекст" metric="42" />,
    );
    expect(getByText("Контекст")).toBeInTheDocument();
    expect(getByText("42")).toBeInTheDocument();
  });

  it("does not render a ring slot when omitted", () => {
    const { container } = render(<HeroValueLine narrative="n" metric="m" />);
    expect(container.querySelectorAll(".shrink-0").length).toBe(0);
  });

  it("renders the ring slot when provided", () => {
    const { getByTestId } = render(
      <HeroValueLine
        narrative="n"
        metric="m"
        ring={<div data-testid="ring" />}
      />,
    );
    expect(getByTestId("ring")).toBeInTheDocument();
  });

  it("defaults to align='start' (items-start text-left)", () => {
    const { container } = render(<HeroValueLine narrative="n" metric="m" />);
    expect(container.firstElementChild!.className).toContain("items-start");
    expect(container.firstElementChild!.className).toContain("text-left");
  });

  it("applies align='center' classes to wrapper and inner stack", () => {
    const { container } = render(
      <HeroValueLine narrative="n" metric="m" align="center" />,
    );
    expect(container.firstElementChild!.className).toContain("items-center");
    const inner = container.querySelector(".flex-1")!;
    expect(inner.className).toContain("sm:items-center");
  });

  it("merges a custom className", () => {
    const { container } = render(
      <HeroValueLine narrative="n" metric="m" className="extra" />,
    );
    expect(container.firstElementChild!.className).toContain("extra");
  });
});
