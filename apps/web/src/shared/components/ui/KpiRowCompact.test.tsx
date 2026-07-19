/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { KpiRowCompact, type KpiItem } from "./KpiRowCompact";

afterEach(cleanup);

describe("KpiRowCompact", () => {
  it("renders nothing for an empty items array", () => {
    const { container } = render(<KpiRowCompact items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders label/value for each item", () => {
    const items: KpiItem[] = [
      { label: "Streak", value: "7" },
      { label: "Kcal", value: 1800 },
    ];
    const { getByText } = render(<KpiRowCompact items={items} />);
    expect(getByText("Streak")).toBeInTheDocument();
    expect(getByText("7")).toBeInTheDocument();
    expect(getByText("Kcal")).toBeInTheDocument();
    expect(getByText("1800")).toBeInTheDocument();
  });

  it("does not render a leading separator dot for the first item", () => {
    const { container } = render(
      <KpiRowCompact items={[{ label: "A", value: 1 }]} />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("renders a separator dot before every item after the first", () => {
    const items: KpiItem[] = [
      { label: "A", value: 1 },
      { label: "B", value: 2 },
      { label: "C", value: 3 },
    ];
    const { container } = render(<KpiRowCompact items={items} />);
    const dots = container.querySelectorAll('li > [aria-hidden="true"]');
    // 2 separators (before item 2 and item 3), icons not present.
    expect(dots.length).toBe(2);
  });

  it("tints the separator with the module accent when `module` is set", () => {
    const items: KpiItem[] = [
      { label: "A", value: 1 },
      { label: "B", value: 2 },
    ];
    const { container } = render(
      <KpiRowCompact items={items} module="nutrition" />,
    );
    const dot = container.querySelectorAll("li")[1]!.querySelector("span")!;
    expect(dot.className).toContain("text-nutrition");
  });

  it("renders an optional icon per item", () => {
    const { getByTestId } = render(
      <KpiRowCompact
        items={[{ label: "A", value: 1, icon: <span data-testid="ic" /> }]}
      />,
    );
    expect(getByTestId("ic")).toBeInTheDocument();
  });

  it("applies hero-ink tone classes when tone='hero-ink'", () => {
    const { getByText } = render(
      <KpiRowCompact items={[{ label: "A", value: 1 }]} tone="hero-ink" />,
    );
    expect(getByText("A").className).toContain("text-hero-ink/60");
    expect(getByText("1").className).toContain("text-hero-ink");
  });

  it("defaults to the neutral separator when module is omitted", () => {
    const items: KpiItem[] = [
      { label: "A", value: 1 },
      { label: "B", value: 2 },
    ];
    const { container } = render(<KpiRowCompact items={items} />);
    const dot = container.querySelectorAll("li")[1]!.querySelector("span")!;
    expect(dot.className).toContain("text-line");
  });
});
